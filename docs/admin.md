# Administration (Phase 7)

## Roles and permissions
| Role | Can do |
|---|---|
| `moderator` | Overview, seller applications (approve / reject / suspend / reinstate), listing moderation, report handling |
| `admin` | Everything a moderator can, plus: users (suspend / reactivate, moderator role, student-verification status), "Verified seller" badge, categories and fields, platform settings, audit log |

Enforcement is on the API: every `/api/v1/admin/*` route carries a role requirement checked by the global `RolesGuard`, against roles loaded from the database on each request (revoking a role or suspending an account takes effect immediately). The web admin area only hides what a person can't use.
- Nobody can grant themselves a role: profile updates reject `roles`, and the role endpoint is admin-only.
- Only the **moderator** role can be granted over HTTP. The **admin** role is created and revoked only with the server-side CLI (`cd server && npm run admin:grant -- <email> admin [--revoke]`). To securely set a password and grant admin access to an existing account in PowerShell, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (from a `Read-Host -AsSecureString` prompt) and run `npm run admin:create`; it also signs out the account's active sessions.

## Endpoints (`/api/v1/admin`)
Moderators and admins: `GET overview`; `GET sellers/applications`; `PATCH sellers/:id/review`; `GET products/pending`, `GET products` (status + text filter), `GET products/:id`, `PATCH products/:id/review`; `GET reports`, `GET reports/:id`, `PATCH reports/:id`.
Admins only: `PATCH sellers/:id/verified`; `GET users`, `GET users/:id`, `PATCH users/:id/status`, `POST users/:id/roles`, `DELETE users/:id/roles/moderator`, `PATCH users/:id/student-verification`; `GET/POST categories`, `GET/PATCH categories/:id`, `POST categories/:id/attributes`, `PATCH/DELETE categories/attributes/:attributeId`; `GET settings`, `PATCH settings/:key`, `POST settings/site-logo`; `GET audit-logs`.

The General settings group lets administrators upload or remove the public site logo. Uploads are restricted to the configured JPEG/PNG/WebP formats and image-size limit, then re-encoded to WebP while preserving the original proportions. The logo uses the configured public storage driver; removal restores the built-in SAZU wordmark.

## Overview
Every number is a live query: registered users, unique browser visitors since tracking began, browser visitors with a heartbeat in the last two minutes, approved sellers, pending seller applications, active listings, listings awaiting review, reported products (distinct products with open reports), open reports, plus the 10 most recent audit entries. Visitor counts begin after migration `1700000010000_site-visitor-analytics.sql` is applied. The visitor tracker stores a random browser identifier only as a server-keyed hash; it does not store page paths, IP addresses, or chat activity. Clearing browser storage or using another browser can count the same person as another visitor. The published privacy text should disclose this aggregate analytics before enabling tracking in production.

## Moderation
- **Sellers**: review reuses the same service as the CLI. Rejecting and suspending need a reason; suspending hides all listings instantly (public visibility requires an approved seller). The seller is notified. The "Verified seller" badge appears only after an admin confirms it.
- **Listings**: `approve` (pending only; publishes and applies expiry), `reject` (pending only; reason required, shown to the seller who can fix and resubmit), `remove` (reason required; hides at once; the seller cannot edit or restore), `restore` (back to live if it was ever public, otherwise back into the review queue). Each decision notifies the seller and is recorded in `moderation_actions` with the reason, and in the audit log.
- **Reports**: `open -> reviewing -> resolved | dismissed`. Closing needs a note (3+ characters). The reporter gets a deliberately generic thank-you and is not told what happened to anyone else. **Conversation reports expose the transcript to moderators; each read is written to the audit log (`report.view_conversation`).** Resolving a report doesn't automatically act on its target: moderators use the listing/seller/user tools, so every action has its own reason and record.

## Users
Search by email or name, filter by status and role (wildcards are treated literally). Details never include password hashes or tokens; contact details are visible to admins only. Suspension needs a reason, signs the person out of every device immediately, and cannot target yourself or an administrator. Student verification records an administrator's own decision: **there is no evidence-upload flow and no verification rule is assumed**.

## Categories
Two levels. Create, rename, reorder, enable/disable (disabling hides the category, its subcategories and their listings), add listing **guidelines** shown to sellers, and set a per-category **photo limit** (enforced on upload). Fields (specifications) can be added, made required/optional, and edited; a field sellers have already filled in can't be deleted (it would erase their data), so make it optional instead. Slugs are stable and not editable.

## Platform settings
Validated by type and range, applied within seconds (15 s cache), and audit-logged with before/after values (long texts by size only): seller approval, photo requirement, listing expiry, active-listing cap, image count/size/formats, anti-spam limits, and public content (support email/phone, about, community guidelines, terms, privacy). Listings publish immediately after seller submission; administrators can remove listings that violate policy. `GET /api/v1/settings/public` exposes only the content keys. **Empty content means "not published yet": the `/safety`, `/terms`, `/privacy`, `/about` and `/contact` pages say so rather than inventing policy.** The administrators must supply the real text.

## Audit trail
`audit_logs` is append-only (database trigger blocks UPDATE and DELETE; the only allowed change is the database nulling `actor_id` if an account row is ever hard-deleted). Viewable by admins at `/admin/audit` with action and actor filters.

## Not yet implemented
Student-affiliation evidence upload and review (private storage exists but no flow uses it); seller verification documents; bulk actions; email notifications of moderation decisions (in-app notifications only); automatic closing of other reports when a listing is removed; per-moderator permissions finer than the two roles; a scheduled job to expire listings and clean old data (Phase 9).
