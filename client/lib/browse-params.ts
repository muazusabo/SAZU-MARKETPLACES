/**
 * Browse state lives in the URL (shareable, back-button friendly, server-rendered).
 * Everything coming from the URL is untrusted and normalised here; the API validates again.
 */
export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
] as const;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONDITIONS = ['new', 'like_new', 'used_good', 'used_fair'];
const AVAILABILITIES = ['available', 'reserved', 'sold', 'unavailable'];
const TYPES = ['product', 'service'];
const SORTS = SORT_OPTIONS.map((s) => s.value as string);
const MAX_NAIRA = 1_000_000_000;

export interface BrowseParams {
  q?: string; category?: string; seller?: string; minPrice?: number; maxPrice?: number; condition?: string;
  availability?: string; type?: string; location?: string; sort?: string; page: number;
}
type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const text = (v: string | string[] | undefined, max: number) => first(v)?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
const oneOf = (v: string | string[] | undefined, allowed: string[]) => { const x = first(v); return x && allowed.includes(x) ? x : undefined; };
const naira = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return first(v) && Number.isFinite(n) && n >= 0 && n <= MAX_NAIRA ? Math.floor(n) : undefined;
};

export function parseBrowseParams(raw: RawParams): BrowseParams {
  const slug = (v: string | string[] | undefined) => { const x = first(v)?.trim(); return x && SLUG.test(x) ? x : undefined; };
  const page = Number(first(raw.page));
  let minPrice = naira(raw.minPrice);
  let maxPrice = naira(raw.maxPrice);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const q = text(raw.q, 100);
  const sort = oneOf(raw.sort, SORTS);
  return {
    q, category: slug(raw.category), seller: slug(raw.seller), minPrice, maxPrice,
    condition: oneOf(raw.condition, CONDITIONS), availability: oneOf(raw.availability, AVAILABILITIES),
    type: oneOf(raw.type, TYPES), location: text(raw.location, 80),
    sort: sort === 'relevance' && !q ? undefined : sort,
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Query string for the web URL (prices in naira). Defaults are omitted. */
export function toUrlQuery(p: BrowseParams, overrides: Partial<BrowseParams> = {}): string {
  const m = { ...p, ...overrides };
  const u = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== '') u.set(k, String(v)); };
  set('q', m.q); set('category', m.category); set('seller', m.seller);
  set('minPrice', m.minPrice); set('maxPrice', m.maxPrice); set('condition', m.condition);
  set('availability', m.availability); set('type', m.type); set('location', m.location); set('sort', m.sort);
  if (m.page > 1) set('page', m.page);
  return u.toString();
}

/** Query string for the API (prices in kobo). */
export function toApiQuery(p: BrowseParams, pageSize = 12): string {
  const u = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== '') u.set(k, String(v)); };
  set('q', p.q); set('category', p.category); set('seller', p.seller);
  set('minPriceKobo', p.minPrice !== undefined ? p.minPrice * 100 : undefined);
  set('maxPriceKobo', p.maxPrice !== undefined ? p.maxPrice * 100 : undefined);
  set('condition', p.condition); set('availability', p.availability); set('type', p.type);
  set('location', p.location); set('sort', p.sort);
  set('page', p.page); set('pageSize', pageSize);
  return u.toString();
}

export const hasActiveFilters = (p: BrowseParams) =>
  Boolean(p.q || p.category || p.seller || p.minPrice !== undefined || p.maxPrice !== undefined || p.condition || p.availability || p.type || p.location);
