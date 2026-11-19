# Authentication and authorization (Phase 2)

## Flow
- **Register** (`POST /auth/register`) always answers 202 with the same message, whether or not the email exists (an existing owner gets an informational email instead), so it cannot be used to enumerate accounts. After registration the web app signs the user in and routes them to their dashboard without requiring email verification first. Users can verify their email from the dashboard when they want to apply as a seller; administrators can verify a user's email or review their student-verification request. Mail delivery failure does not undo account creation, and users can request another code from the dashboard. Passwords: 10-128 chars, hashed with argon2id.
- **Email verification**: single-use, randomly generated 8-digit code, stored as a SHA-256 hash, expires in 10 minutes, and is invalidated on resend. Five incorrect guesses consume the code; verification and resend are rate-limited. Login works before verification, but `emailVerified` is exposed and `@RequireVerifiedEmail()` gates features (seller application and messaging). Email verification is separate from student-affiliation verification.
- **Login** returns a 15-minute JWT access token (kept in browser memory only) and sets an `httpOnly` refresh cookie scoped to `/api/v1/auth`. Same error for wrong password and unknown email, with equalised timing. 5 failures lock the account for 15 minutes. Per-IP throttling on every credential endpoint.
- **Refresh tokens** are opaque, stored only as hashes, and rotate on every use. Replaying an already-rotated token (outside a 10 s grace for parallel tabs) revokes the entire chain.
- **Password reset**: 1 h single-use token; completing it revokes every session. Reset also proves email ownership.
- **Deactivate** is reversible (signing in reactivates). **Delete** anonymises the profile, frees the email, removes extra roles and revokes sessions; the row stays so future listings/messages keep referential integrity.

## Authorization
- Every route is **private by default** (global `JwtAuthGuard`); public routes opt in with `@Public()`.
- The guard re-loads the user on each request, so suspension and role changes apply immediately, not at token expiry.
- `@Roles('admin')` + global `RolesGuard` enforce roles on the server. Roles are never accepted from request bodies (DTOs use `whitelist` + `forbidNonWhitelisted`). Administrator access is provisioned with the server-side `admin:create` or `admin:grant` CLI.
- The web `RequireAuth` component is a UX convenience only; the API is the security boundary.

## Web dashboard routing
- After login, administrators and moderators default to `/admin`, seller accounts default to `/dashboard` (where seller status is checked), and buyers default to `/account`.
- A safe, authorized same-site `next` destination is preserved. Buyers cannot be redirected into admin or seller-only dashboard routes, and moderators are redirected away from administrator-only sections.
- Signed-in users visiting login or registration are redirected to their role-appropriate destination. New registrations are signed in and routed to their dashboard before confirming email; email confirmation remains available from the dashboard and is still required for seller applications and messaging.

## Student verification
Signed-in users can request student-affiliation review from their `/account` dashboard without first confirming their email. Requests move an unverified or previously rejected profile to `pending`; duplicate pending requests and requests from already verified users are rejected. Administrators can find pending requests in the user list and mark them verified or rejected. No evidence upload is currently supported.

## Not yet implemented
Student verification evidence upload, change-password-while-signed-in, a "sign out everywhere" button.
