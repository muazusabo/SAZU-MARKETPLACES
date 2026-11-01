import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { hashToken, newOpaqueToken } from './token.util';

export type TokenPurpose = 'verify_email' | 'reset_password';
const MAX_VERIFICATION_CODE_ATTEMPTS = 5;

@Injectable()
export class EmailTokenService {
  constructor(private readonly db: DatabaseService) {}

  /** Creates a fresh single-use token and invalidates earlier unused ones for the same purpose. */
  async issue(userId: string, purpose: TokenPurpose, ttlMinutes: number): Promise<string> {
    const raw = newOpaqueToken();
    await this.store(userId, purpose, raw, ttlMinutes);
    return raw;
  }

  async issueVerificationCode(userId: string, ttlMinutes: number): Promise<string> {
    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    await this.store(userId, 'verify_email', code, ttlMinutes);
    return code;
  }

  private async store(userId: string, purpose: TokenPurpose, raw: string, ttlMinutes: number): Promise<void> {
    await this.db.transaction(async (c) => {
      await c.query(
        'UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
        [userId, purpose],
      );
      await c.query(
        `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
        [userId, purpose, hashToken(raw), ttlMinutes],
      );
    });
  }

  /** Atomically marks the token used and returns its user, or null if invalid, used, or expired. */
  async consume(purpose: TokenPurpose, raw: string): Promise<string | null> {
    const { rows } = await this.db.query<{ user_id: string }>(
      `UPDATE email_tokens SET used_at = now()
       WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [hashToken(raw), purpose],
    );
    return rows[0]?.user_id ?? null;
  }

  /** Counts failed guesses and consumes the code on success or after five incorrect attempts. */
  async consumeVerificationCode(userId: string, code: string): Promise<string | null> {
    const { rows } = await this.db.query<{ user_id: string | null }>(
      `UPDATE email_tokens
       SET attempts = attempts + 1,
           used_at = CASE WHEN token_hash = $2 OR attempts + 1 >= $3 THEN now() ELSE used_at END
       WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL
         AND expires_at > now() AND attempts < $3
       RETURNING CASE WHEN token_hash = $2 THEN user_id ELSE NULL END AS user_id`,
      [userId, hashToken(code), MAX_VERIFICATION_CODE_ATTEMPTS],
    );
    return rows[0]?.user_id ?? null;
  }
}
