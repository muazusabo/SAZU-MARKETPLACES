# Architecture (Phase 1)

```
Browser ──► Next.js (apps/web) ──REST /api/v1──► NestJS (apps/api) ──pg──► PostgreSQL
                                                      └──(Phase 4)──► Cloudinary / S3-compatible / local storage
```

## Decisions

- **PostgreSQL only, no Supabase.** The API owns identity, authorization, and storage, so the stack is portable to any host.
  Because there is no Supabase RLS layer, **authorization is enforced in NestJS** (guards, ownership checks in every query);
  PostgreSQL constraints, foreign keys and (optionally, later) RLS act as defence in depth.
- **`pg` + SQL migrations** (`node-pg-migrate`) rather than an ORM: reviewable, reversible, no binary engine downloads. Money is stored as integer kobo.
- **One DB boundary**: `DatabaseService` (pooled, parameterised queries, `transaction()` helper). Feature modules never open their own pools.
- **Fail-fast config**: Zod-validated environment at boot.
- **Uniform HTTP behaviour** (`configureApp`, shared with e2e tests): Helmet, strict CORS allow-list, global validation (whitelist, forbid unknown fields), `{ data, meta? }` success envelope, one error shape with `requestId`, no stack traces in responses, per-request id logging, global rate limiting.
- **Web**: Server Components by default; Client Components only for the header menu, search form, and providers. API access goes through `lib/api.ts`.
- **Design**: forest green + muted gold on warm paper, Bricolage Grotesque / Figtree self-hosted via npm; light default, dark tokens defined.

## Layout

```
apps/api/src/{config,database,common,health}   apps/api/migrations   apps/api/test
apps/web/{app,components/{ui,layout,home},lib}
docs/
```

## Phase 2 (implemented)

Tables: `users`, `user_roles`, `profiles`, `refresh_tokens`, `email_tokens`. Modules: `AuthModule`, `UsersModule`, `MailModule`. See `docs/auth.md`.

## Phase 3 (implemented)

Tables: `categories`, `category_attributes`, `seller_profiles`, `products`, `product_images`, `product_attribute_values`, `product_views`. Modules: `CategoriesModule`, `ProductsModule`, `SellersModule` (public read side only). See `docs/catalog.md`.

## Phase 4 (implemented)

Tables/columns: `platform_settings`, `seller_profile_categories`, `seller_profiles.{review_note,submitted_at,contact_preferences}`, `product_images.{thumb_path,width,height,byte_size}`, `products.archived_at`. Modules: `SettingsModule`, `StorageModule` (drivers + image pipeline), seller account and seller listing controllers. See `docs/seller.md`.

## Phase 5 (implemented)

Tables: `wishlist_items`, `conversations`, `conversation_participants`, `messages`; settings `max_new_conversations_per_day`, `max_wishlist_items`. Modules: `WishlistModule`, `ConversationsModule`. See `docs/buyer.md`.

## Phase 6 (implemented)

Tables: `notifications`, `user_blocks`, `reports`, `conversation_participants.last_read_message_id`; settings `max_messages_per_minute`, `max_reports_per_day`. Modules: `RealtimeModule` (Socket.IO gateway + origin-checked adapter), `NotificationsModule`, `ReportsModule`; blocking, read state and spam limits live in `ConversationsService`. See `docs/messaging.md`.

## Phase 7 (implemented)

Tables: `audit_logs` (append-only), `moderation_actions`; columns `categories.guidelines`, `categories.max_images`; new settings (image formats, site content, student-verification flag). Modules: `AdminModule` (moderation and management controllers), `AuditModule`; `SettingsService` now validates and writes settings and serves public content. See `docs/admin.md`.
