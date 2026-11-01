import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { REFRESH_REUSE_GRACE_SECONDS } from './auth.constants';
import { hashToken, newOpaqueToken } from './token.util';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number; // seconds
  refreshToken: string;
  refreshMaxAgeMs: number;
  userId: string;
}

@Injectable()
export class SessionService {
  private readonly accessTtlSec: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSec = config.get('JWT_ACCESS_TTL_MINUTES', { infer: true }) * 60;
    this.refreshTtlMs = config.get('JWT_REFRESH_TTL_DAYS', { infer: true }) * 86_400_000;
  }

  async issue(userId: string, userAgent?: string, familyId: string = randomUUID()): Promise<IssuedSession & { rowId: string }> {
    const refreshToken = newOpaqueToken();
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5) RETURNING id`,
      [userId, familyId, hashToken(refreshToken), this.refreshTtlMs / 1000, userAgent?.slice(0, 200) ?? null],
    );
    const accessToken = await this.jwt.signAsync({ sub: userId }, { algorithm: 'HS256', expiresIn: this.accessTtlSec });
    return { accessToken, expiresIn: this.accessTtlSec, refreshToken, refreshMaxAgeMs: this.refreshTtlMs, userId, rowId: rows[0]!.id };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token after the grace window is treated
   * as theft: the whole family is revoked and the user must sign in again.
   */
  async rotate(raw: string, userAgent?: string): Promise<IssuedSession> {
    const invalid = new UnauthorizedException('Your session has expired. Please sign in again.');
    const { rows } = await this.db.query<{
      id: string; user_id: string; family_id: string; expired: boolean; revoked_at: Date | null;
      recently_rotated: boolean; status: string;
    }>(
      `SELECT t.id, t.user_id, t.family_id, t.expires_at <= now() AS expired, t.revoked_at,
              (t.revoked_at IS NOT NULL AND t.replaced_by IS NOT NULL
                 AND t.revoked_at > now() - make_interval(secs => $2)) AS recently_rotated,
              u.status
       FROM refresh_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1`,
      [hashToken(raw), REFRESH_REUSE_GRACE_SECONDS],
    );
    const row = rows[0];
    if (!row) throw invalid;

    if (row.revoked_at) {
      // Parallel tabs can legitimately present the token a moment after it rotated: reject without punishing.
      if (!row.recently_rotated) await this.revokeFamily(row.family_id);
      throw invalid;
    }
    if (row.expired || row.status !== 'active') throw invalid;

    const claimed = await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [row.id]);
    if (claimed.rowCount === 0) throw invalid; // lost a race with a parallel request

    const next = await this.issue(row.user_id, userAgent, row.family_id);
    await this.db.query('UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1', [row.id, next.rowId]);
    return next;
  }

  async revokeByToken(raw: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL`,
      [hashToken(raw)],
    );
  }

  private async revokeFamily(familyId: string) {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);
  }

  async revokeAllForUser(userId: string) {
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }
}
