# Seller tools (Phase 4)

## Seller lifecycle
`draft -> pending -> approved | rejected -> (edit and resubmit) ; approved <-> suspended`.
Requires a verified email to apply. Pending sellers can create listings and publish them without waiting for seller approval. Listings do not require administrator approval before going live. Seller approval controls seller verification and storefront availability, not whether a pending applicant can start listing. Whether seller approval is required is the `seller_approval_required` setting (default true; if false, applications are approved instantly). Until the admin dashboard exists (Phase 7), operators review with:

```bash
npm run build -w apps/api
npm run admin:seller -w apps/api -- <shop-slug|email> approve
npm run admin:seller -w apps/api -- <shop-slug|email> reject "Reason shown to the seller"
npm run admin:seller -w apps/api -- <shop-slug|email> suspend "Reason"      # hides all their listings immediately
npm run admin:seller -w apps/api -- <shop-slug|email> reinstate
```
The CLI calls the same `SellerAccountService.review()` the Phase 7 admin endpoints will use. Rejections and suspensions require a reason.

## Listing lifecycle
`draft -> published`. Material edits to published listings stay public. Administrators can remove a listing for a policy violation or act on reports, but publication does not wait for admin review.
- Material edits (title, description, category, type, category fields, photos), price, condition, location and availability edits to a published listing stay public.
- `mark-sold / mark-reserved / mark-unavailable / mark-available` apply to published listings only. Sold listings leave default browsing but their page stays reachable with a clear state.
- `archive` hides a listing; `restore` returns it as a **draft** (it must be submitted again).
- `DELETE` is allowed only for listings that were never published (draft/rejected/archived). Anything that was ever public is kept for moderation history; sellers archive it instead. Files are removed on delete.
- Slugs are generated from the title at creation (unique, suffixed on collision) and then stay stable.

## Authorization
Listing endpoints require sign-in and a submitted seller application (`pending` or `approved`); draft, rejected and suspended profiles cannot manage listings. Pending sellers can publish listings immediately, though their storefront is only public after the seller is approved or they have a published listing. Ownership is part of each SQL query, and another seller's listing returns 404 for every read and write (covered for all 11 endpoints by tests). Bodies cannot set status, seller, slug or ids (unknown fields are rejected).

## Images
Accepted: JPEG, PNG, WebP. The file type is decided from the file's **bytes**, never its name or declared type; the image is then fully decoded and re-encoded to WebP (1600px max plus a 480px thumbnail), which strips EXIF/GPS data and discards any hidden payload. Server-generated names (`products/<id>/<uuid>.webp`); existing objects are never overwritten. Limits come from `platform_settings`: `max_images_per_listing` (6), `max_image_bytes` (5 MB), `max_uploads_per_user_per_day` (60), plus request throttling (`THROTTLE_WRITE_LIMIT`, default 30/min/IP).

## Storage
`STORAGE_DRIVER=local` stores under `STORAGE_LOCAL_DIR` (`public/` is served at `/files`, `private/` is never served). `STORAGE_DRIVER=s3` uses any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO); set `PUBLIC_FILES_BASE_URL` to its public/CDN URL. `STORAGE_DRIVER=cloudinary` stores new public images in Cloudinary; set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server environment. Do not commit credentials.

On a Cloudinary cutover, `STORAGE_LEGACY_DRIVER` defaults to `local` and serves/deletes existing untagged image keys from that provider. Set it to `s3` if existing image keys are in S3, and keep the associated S3 environment variables configured. Private files continue using the legacy driver and are never uploaded to Cloudinary. New Cloudinary keys are tagged in the database, so their URLs and deletion remain provider-aware. **The S3 and Cloudinary drivers are unit-tested without live provider credentials; verify each in staging before relying on it.**

## Settings (runtime, `platform_settings`)
`seller_approval_required, require_listing_image, max_images_per_listing, max_image_bytes, max_uploads_per_user_per_day, max_active_listings_per_seller, listing_expiry_days`. Read with a 15-second cache. Administrators change them in the admin dashboard (Settings).

## Not yet implemented
Seller verification evidence upload (private bucket exists in the storage layer but no endpoint uses it; this needs the admin review flow and the configurable policy from Phase 7); reviewer approval/rejection of listings and sellers over HTTP (Phase 7); unread-message and wishlist indicators on the dashboard (Phases 5-6); orphan-file cleanup job for failed deletes.
