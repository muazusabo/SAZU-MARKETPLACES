export const REFRESH_COOKIE = 'sazu_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const TERMS_VERSION = 'draft-0'; // bump when the published Terms change
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const REFRESH_REUSE_GRACE_SECONDS = 10;
/**
 * Per-IP limit on credential endpoints (register, login, password reset). Looser than a single-user limit on purpose: students share
 * one campus gateway IP, and real protection against password guessing is the per-account lockout. Tune for your network.
 */
export const AUTH_THROTTLE = { default: { limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 60), ttl: 60_000 } };
export const VERIFY_THROTTLE = { default: { limit: Number(process.env.THROTTLE_VERIFY_LIMIT ?? 10), ttl: 60_000 } };
/** Session refresh happens on every page load and needs an unguessable cookie, so it gets a generous limit of its own. */
export const REFRESH_THROTTLE = { default: { limit: Number(process.env.THROTTLE_REFRESH_LIMIT ?? 300), ttl: 60_000 } };
/** Per-IP limit on write-heavy endpoints (listing creation, uploads). Configurable so deployments and tests can tune it. */
export const WRITE_THROTTLE = { default: { limit: Number(process.env.THROTTLE_WRITE_LIMIT ?? 30), ttl: 60_000 } };
export const AVATAR_THROTTLE = { default: { limit: Number(process.env.THROTTLE_WRITE_LIMIT ?? 20), ttl: 60_000 } };
export type Role = 'user' | 'seller' | 'moderator' | 'admin';
export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
  emailVerified: boolean;
}
