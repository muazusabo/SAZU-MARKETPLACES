import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { LOCK_MINUTES, MAX_FAILED_LOGINS, TERMS_VERSION } from './auth.constants';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { EmailTokenService } from './email-token.service';
import { IssuedSession, SessionService } from './session.service';

const VERIFY_CODE_TTL_MIN = 10;
const RESET_TTL_MIN = 60;

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;
  private readonly webUrl: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly sessions: SessionService,
    private readonly tokens: EmailTokenService,
    private readonly mail: MailService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('APP_WEB_URL', { infer: true }).replace(/\/$/, '');
  }

  /**
   * Always resolves the same way whether or not the email is already registered, so the endpoint
   * cannot be used to discover who has an account.
   */
  async register(dto: RegisterDto): Promise<void> {
    const passwordHash = await argon2.hash(dto.password);
    let userId: string;
    try {
      userId = await this.db.transaction(async (c) => {
        const u = await c.query<{ id: string }>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [dto.email, passwordHash]);
        const id = u.rows[0]!.id;
        await c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'user')`, [id]);
        await c.query(
          `INSERT INTO profiles (user_id, full_name, display_name, phone, campus_area, terms_accepted_at, terms_version)
           VALUES ($1, $2, $3, $4, $5, now(), $6)`,
          [id, dto.fullName, dto.displayName, dto.phone ?? null, dto.campusArea ?? null, TERMS_VERSION],
        );
        return id;
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        await this.mail.send({
          to: dto.email,
          subject: 'Someone tried to register with your email on SAZU Marketplace',
          text: `Hello,\n\nSomeone tried to create a SAZU Marketplace account with this email address, but an account already exists.\nIf this was you, sign in or reset your password: ${this.webUrl}/forgot-password\nIf it wasn't you, you can ignore this message.\n`,
        });
        return;
      }
      throw err;
    }
    await this.sendVerification(userId, dto.email, dto.displayName);
  }

  private async sendVerification(userId: string, email: string, name: string) {
    const code = await this.tokens.issueVerificationCode(userId, VERIFY_CODE_TTL_MIN);
    await this.mail.send({
      to: email,
      subject: 'Your SAZU Marketplace verification code',
      text: `Hello ${name},\n\nEnter this verification code to confirm your email address:\n\n${code}\n\nThis code expires in 10 minutes and can be used once. If you didn't create this account, ignore this email.\n`,
    });
  }

  async resendVerification(email: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string; display_name: string }>(
      `SELECT u.id, p.display_name FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.email = $1 AND u.status = 'active' AND u.email_verified_at IS NULL`,
      [email],
    );
    if (rows[0]) await this.sendVerification(rows[0].id, email, rows[0].display_name);
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND status = 'active' AND email_verified_at IS NULL`,
      [email],
    );
    const userId = rows[0] && await this.tokens.consumeVerificationCode(rows[0].id, code);
    if (!userId) throw new BadRequestException('This verification code is invalid or has expired. Request a new one.');
    await this.db.query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL', [userId]);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<{ session: IssuedSession; user: Awaited<ReturnType<UsersService['getMe']>> }> {
    const generic = new UnauthorizedException('Incorrect email or password.');
    const { rows } = await this.db.query<{
      id: string; password_hash: string; status: string; failed_login_count: number; locked: boolean;
    }>(
      `SELECT id, password_hash, status, failed_login_count, (locked_until IS NOT NULL AND locked_until > now()) AS locked
       FROM users WHERE email = $1`,
      [dto.email],
    );
    const user = rows[0];

    if (!user || user.status === 'deleted') {
      // Spend comparable time so response timing doesn't reveal whether the email exists.
      this.dummyHash ??= argon2.hash('timing-equaliser');
      await argon2.verify(await this.dummyHash, dto.password).catch(() => false);
      throw generic;
    }
    if (user.locked) {
      throw new HttpException('Too many failed sign-in attempts. Try again in a few minutes or reset your password.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await argon2.verify(user.password_hash, dto.password).catch(() => false))) {
      await this.db.query(
        `UPDATE users SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      throw generic;
    }
    if (user.status === 'suspended') {
      throw new ForbiddenException('This account has been suspended. Contact support for help.');
    }
    await this.db.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now(),
         status = CASE WHEN status = 'deactivated' THEN 'active' ELSE status END WHERE id = $1`,
      [user.id],
    );
    const session = await this.sessions.issue(user.id, userAgent);
    return { session, user: await this.users.getMe(user.id) };
  }

  async forgotPassword(email: string): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND status IN ('active', 'deactivated')`, [email]);
    if (!rows[0]) return;
    const token = await this.tokens.issue(rows[0].id, 'reset_password', RESET_TTL_MIN);
    await this.mail.send({
      to: email,
      subject: 'Reset your SAZU Marketplace password',
      text: `We received a request to reset your password (link valid for 1 hour):\n${this.webUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email; your password won't change.\n`,
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.tokens.consume('reset_password', token);
    if (!userId) throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    const hash = await argon2.hash(password);
    await this.db.query(
      `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL,
         email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND status <> 'deleted'`,
      [userId, hash],
    );
    await this.sessions.revokeAllForUser(userId); // every device must sign in again
  }
}
