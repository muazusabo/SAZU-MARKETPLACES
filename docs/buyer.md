# Buyer experience (Phase 5)

## Wishlist
`wishlist_items (user_id, product_id)` has a composite primary key, so a person can save a product at most once. This replaces separate `wishlists` and `wishlist_items` tables because each user has exactly one wishlist.
- `GET /wishlist` (paged), `GET /wishlist/ids`, `POST /wishlist/:productId` and `DELETE /wishlist/:productId` (both idempotent). Everything is scoped to the signed-in user; wishlists are never public.
- Only publicly visible listings can be saved. Saved items that later become sold, unavailable or removed stay in the list with a `state` (`available | reserved | sold | unavailable | removed`); `href` is `null` once the public page no longer exists.
- Limit: `max_wishlist_items` setting (default 200).
- Sellers see only an aggregate `saves` count per listing; who saved is never exposed.

## Contact actions
`POST /conversations { productId, interested? }` powers both **Chat with Seller** and **I'm Interested**. It requires a signed-in user with a verified email, and the server checks that:
1. the listing exists and is publicly visible (otherwise 404);
2. the caller is not the seller (400);
3. the listing is not sold (409) or unavailable (409). Reserved listings still accept enquiries;
4. the buyer is under `max_new_conversations_per_day` (default 30, then 429; reopening an existing conversation does not count).

It then creates the conversation for that buyer, seller and listing, or returns the existing one (`created: false`). A unique index (`NULLS NOT DISTINCT`) plus a conflict-safe insert guarantees one conversation per buyer/seller/product even for simultaneous clicks. With `interested: true`, a single friendly message is added only if the conversation is still empty (row-locked, so parallel clicks cannot duplicate it).

Visitors who aren't signed in are sent to `/login?next=<this product>` and returned to the same page afterwards. Only same-site relative paths are accepted for `next`.

## Conversations and messages (basic; Phase 6 completes them)
Tables: `conversations`, `conversation_participants` (per-person `last_read_at`), `messages`.
- `GET /conversations`, `GET /conversations/:id`, `GET /conversations/:id/messages?before=&limit=`, `POST /conversations/:id/messages`.
- Every read and write joins on participation. Non-participants get 404 (not 403) so ids can't be probed. The sender is always the authenticated user; client-supplied participant or sender ids are rejected.
- Bodies are trimmed, control characters removed, 1-2,000 characters, stored as plain text and rendered escaped. Pagination uses a numeric cursor (newest page first).
- Buyers see the seller's shop name, sellers see the buyer's public display name. Emails and phone numbers are never included.
- Existing conversations keep working after an item is sold; only *new* ones are blocked. The conversation shows the live listing state.
- Live delivery, unread counts, read receipts, blocking and reporting were added in Phase 6 (see `docs/messaging.md`).

## Not yet implemented
See `docs/messaging.md`.
