# Authentication and authorization (Phase 2)

## Flow
- **Register** (`POST /auth/register`) always answers 202 with the same message, whether or not the email exists (an existing owner gets an informational email instead), so it cannot be used to enumerate accounts. Passwords: 10-128 chars, hashed with argon2id.
- **Email verification**: single-use, randomly generated 8-digit code, stored as a SHA-256 hash, expires in 10 minutes, and is invalidated on resend. Five incorrect guesses consume the code; verification and resend are rate-limited. Login works before verification, but `emailVerified` is exposed and `@RequireVerifiedEmail()` gates features (seller application and messaging). Email verification is separate from student-affiliation verification (`profiles.student_verification_status`, built later).
- **Login** returns a 15-minute JWT access token (kept in browser memory only) and sets an `httpOnly` refresh cookie scoped to `/api/v1/auth`. Same error for wrong password and unknown email, with equalised timing. 5 failures lock the account for 15 minutes. Per-IP throttling on every credential endpoint.
- **Refresh tokens** are opaque, stored only as hashes, and rotate on every use. Replaying an already-rotated token (outside a 10 s grace for parallel tabs) revokes the entire chain.
- **Password reset**: 1 h single-use token; completing it revokes every session. Reset also proves email ownership.
- **Deactivate** is reversible (signing in reactivates). **Delete** anonymises the profile, frees the email, removes extra roles and revokes sessions; the row stays so future listings/messages keep referential integrity.

## Authorization
- Every route is **private by default** (global `JwtAuthGuard`); public routes opt in with `@Public()`.
- The guard re-loads the user on each request, so suspension and role changes apply immediately, not at token expiry.
- `@Roles('admin')` + global `RolesGuard` enforce roles on the server. Roles are never accepted from request bodies (DTOs use `whitelist` + `forbidNonWhitelisted`). The first admin is granted with the `admin:grant` CLI.
- The web `RequireAuth` component is a UX convenience only; the API is the security boundary.

## Not yet implemented
Profile image upload (needs Phase 4 storage), student verification evidence, change-password-while-signed-in, a "sign out everywhere" button.
