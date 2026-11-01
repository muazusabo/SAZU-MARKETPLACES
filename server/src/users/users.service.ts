import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthUser, Role } from '../auth/auth.constants';
import { assertUpload } from '../common/upload';
import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { ImageService } from '../storage/image.service';
import { StorageService } from '../storage/storage.service';
import { randomUUID } from 'node:crypto';
import { UpdateProfileDto } from './dto/users.dto';

interface MeRow {
  id: string; email: string; status: string; email_verified_at: Date | null; password_hash: string;
  full_name: string; display_name: string; phone: string | null; campus_area: string | null;
  avatar_path: string | null; student_verification_status: string; roles: Role[];
  seller_status: string | null; seller_slug: string | null; shop_name: string | null;
}

const ME_SQL = `
  SELECT u.id, u.email, u.status, u.email_verified_at, u.password_hash,
         p.full_name, p.display_name, p.phone, p.campus_area, p.avatar_path, p.student_verification_status,
         COALESCE((SELECT array_agg(r.role) FROM user_roles r WHERE r.user_id = u.id), '{}') AS roles,
         sp.status AS seller_status, sp.slug AS seller_slug, sp.shop_name
  FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN seller_profiles sp ON sp.user_id = u.id
  WHERE u.id = $1`;

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    private readonly settings: SettingsService,
  ) {}

  /** Minimal identity for the auth guard. Returns null unless the account is active. */
  async findAuthUser(id: string): Promise<AuthUser | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.db.query<{ id: string; email: string; email_verified_at: Date | null; roles: Role[] }>(
      `SELECT u.id, u.email, u.email_verified_at,
              COALESCE((SELECT array_agg(r.role) FROM user_roles r WHERE r.user_id = u.id), '{}') AS roles
       FROM users u WHERE u.id = $1 AND u.status = 'active'`,
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, email: r.email, roles: r.roles, emailVerified: r.email_verified_at !== null } : null;
  }

  async getMe(id: string) {
    const { rows } = await this.db.query<MeRow>(ME_SQL, [id]);
    const r = rows[0];
    if (!r) throw new UnauthorizedException('Account not found.');
    return this.present(r);
  }

  async updateMe(id: string, dto: UpdateProfileDto) {
    const map: Record<string, string> = {
      fullName: 'full_name', displayName: 'display_name', phone: 'phone', campusArea: 'campus_area',
    };
    const sets: string[] = [];
    const vals: unknown[] = [id];
    for (const [key, col] of Object.entries(map)) {
      const v = (dto as Record<string, unknown>)[key];
      if (v === undefined) continue;
      vals.push(v === '' ? null : v);
      sets.push(`${col} = $${vals.length}`); // column names come from the fixed map above, never from input
    }
    if (sets.length) await this.db.query(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $1`, vals);
    return this.getMe(id);
  }

  private async assertPassword(id: string, password: string) {
    const { rows } = await this.db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [id]);
    if (!rows[0] || !(await argon2.verify(rows[0].password_hash, password))) {
      throw new ForbiddenException('That password is not correct.');
    }
  }

  /** Reversible: signing in again reactivates the account. Listings are hidden in later phases. */
  async deactivate(id: string, password: string) {
    await this.assertPassword(id, password);
    await this.db.transaction(async (c) => {
      await c.query(`UPDATE users SET status = 'deactivated' WHERE id = $1`, [id]);
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    });
  }

  /** Irreversible: removes personal data and frees the email address. Row is kept for referential integrity. */
  async deleteAccount(id: string, password: string) {
    await this.assertPassword(id, password);
    await this.db.transaction(async (c) => {
      await c.query(
        `UPDATE users SET status = 'deleted', email = $2, password_hash = '!', email_verified_at = NULL WHERE id = $1`,
        [id, `deleted+${id}@invalid.local`],
      );
      await c.query(
        `UPDATE profiles SET full_name = 'Deleted user', display_name = 'Deleted user', phone = NULL,
                campus_area = NULL, avatar_path = NULL WHERE user_id = $1`,
        [id],
      );
      await c.query('DELETE FROM user_roles WHERE user_id = $1 AND role <> $2', [id, 'user']);
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await c.query('DELETE FROM email_tokens WHERE user_id = $1', [id]);
    });
  }

  present(r: MeRow) {
    return {
      id: r.id,
      email: r.email,
      emailVerified: r.email_verified_at !== null,
      status: r.status,
      roles: r.roles,
      profile: {
        fullName: r.full_name,
        displayName: r.display_name,
        phone: r.phone,
        campusArea: r.campus_area,
        avatarUrl: this.storage.publicUrl(r.avatar_path),
        studentVerificationStatus: r.student_verification_status,
      },
      seller: r.seller_status ? { status: r.seller_status, slug: r.seller_slug, shopName: r.shop_name } : null,
    };
  }

  async setAvatar(id: string, file: Express.Multer.File | undefined) {
    const buf = await this.images.processAvatar(assertUpload(file, await this.settings.get('max_image_bytes')), await this.settings.get('allowed_image_types'));
    const key = `avatars/users/${id}/${randomUUID()}.webp`;
    const storedKey = await this.storage.putPublic(key, buf, 'image/webp');
    const old = await this.db.query<{ avatar_path: string | null }>('SELECT avatar_path FROM profiles WHERE user_id = $1', [id]);
    await this.db.query('UPDATE profiles SET avatar_path = $2 WHERE user_id = $1', [id, storedKey]);
    await this.storage.deletePublic(old.rows[0]?.avatar_path);
    return this.getMe(id);
  }
}
