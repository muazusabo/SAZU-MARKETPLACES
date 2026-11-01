# Public marketplace (Phase 3)

## What is public
Anyone, signed in or not, can browse. A listing is **publicly visible** only when ALL hold (single definition: `server/src/products/visibility.ts`):
`products.status = 'published'` (listings publish immediately after seller submission), the seller is `approved` or `pending` (not rejected or suspended), the category (and its parent) is active, and it has not expired.
Sold/reserved/unavailable listings stay reachable by direct link (with a clear state and no contact) but are hidden from default browsing.

## API (all under `/api/v1`)
| Endpoint | Purpose |
|---|---|
| `GET /categories`, `GET /categories/:slug` | Active tree with real counts; subcategories and specification fields |
| `GET /products` | Search, filter, sort, paginate (see below) |
| `GET /products/:slug` | Public details. Never returns seller email/phone/user ids |
| `POST /products/:slug/reviews` | Add one 1–5 star, written review per signed-in, email-verified user (not the seller) |
| `POST /products/:slug/views` | De-duplicated view recording (1/viewer/product/hour) |
| `GET /sellers/:slug` | Approved storefront, or pending seller with a publicly visible listing |
| `GET /sitemap` | Slugs for `sitemap.xml` |

All endpoints above are public except review creation, which requires sign-in and a verified email. `GET /products` query: `q, category, seller, exclude, excludeSeller, minPriceKobo, maxPriceKobo, condition, availability, type, location, sort (newest|price_asc|price_desc|relevance|popular), page, pageSize (<=48)`. Unknown or invalid parameters return 400. Responses are `{ data, meta: { page, pageSize, total, totalPages } }`. Prices are integer **kobo**.

## Search
PostgreSQL full-text search (`tsvector`, weighted title > description) plus trigram-indexed substring matching on titles, so partial words work ("char" finds "charger"). User text is always bound as a parameter and LIKE wildcards are escaped. `popular` returns only listings with real views in the last 30 days.

## Privacy
View tracking stores a salted hash that rotates daily, not IPs. **Retention:** purge `product_views` older than 90 days on a schedule (`DELETE FROM product_views WHERE viewed_at < now() - interval '90 days'`); a scheduler arrives with deployment work in Phase 9.
Listing reviews expose only the review text, star rating, date, and reviewer display name. Public listing details show the listing ID, date, location, view count, rating summary, and up to 50 newest reviews. Public seller profiles show the approved-since date and only a coarse activity label (“Active today” for a login in the past 24 hours or “Active recently” in the past week); exact login timestamps are never returned.

## Web
`/browse` (state lives in the URL, server-rendered, debounced inputs), `/categories`, `/product/[slug]`, `/seller/[slug]`, `sitemap.xml`, `robots.txt`. Filtered/search/paginated URLs are `noindex`; canonical URLs are set. Pages fetch from the API with a ~30 s cache, so a change can take up to that long to appear.

## Development sample data
`npm run build -w apps/api && npm run seed:dev -w apps/api` creates six listings labelled `[DEV SAMPLE]` under a seller that cannot sign in; add `-- --remove` to delete. It refuses to run when `NODE_ENV=production`.

## Not yet implemented (later phases)
Report listing (Phase 6, needs the reports feature); category/subcategory management UI (Phase 7: two levels are supported by the schema and the API, but only top-level categories exist until then).
