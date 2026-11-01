import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseBrowseParams, toApiQuery, toUrlQuery } from './browse-params';

describe('parseBrowseParams', () => {
  it('normalises valid input', () => {
    const p = parseBrowseParams({ q: '  calculus   textbook ', category: 'books-study-materials', minPrice: '1000', maxPrice: '5000', sort: 'price_asc', page: '2' });
    expect(p).toMatchObject({ q: 'calculus textbook', category: 'books-study-materials', minPrice: 1000, maxPrice: 5000, sort: 'price_asc', page: 2 });
  });
  it('drops anything invalid or hostile instead of passing it on', () => {
    const p = parseBrowseParams({ category: 'Bad Slug!', condition: 'broken', sort: 'hax', page: '-3', minPrice: 'abc', maxPrice: '-5', q: 'x'.repeat(500) });
    expect(p.category).toBeUndefined();
    expect(p.condition).toBeUndefined();
    expect(p.sort).toBeUndefined();
    expect(p.page).toBe(1);
    expect(p.minPrice).toBeUndefined();
    expect(p.maxPrice).toBeUndefined();
    expect(p.q).toHaveLength(100);
  });
  it('takes the first value of repeated params and swaps inverted price ranges', () => {
    const p = parseBrowseParams({ category: ['electronics', 'furniture'], minPrice: '9000', maxPrice: '1000' });
    expect(p.category).toBe('electronics');
    expect([p.minPrice, p.maxPrice]).toEqual([1000, 9000]);
  });
  it('ignores "relevance" sorting when there is no search text', () => {
    expect(parseBrowseParams({ sort: 'relevance' }).sort).toBeUndefined();
    expect(parseBrowseParams({ sort: 'relevance', q: 'phone' }).sort).toBe('relevance');
  });
});

describe('query builders', () => {
  const p = parseBrowseParams({ q: 'phone', minPrice: '2000', maxPrice: '50000', page: '3' });
  it('converts naira to kobo for the API', () => {
    const u = new URLSearchParams(toApiQuery(p, 12));
    expect(u.get('minPriceKobo')).toBe('200000');
    expect(u.get('maxPriceKobo')).toBe('5000000');
    expect(u.get('pageSize')).toBe('12');
  });
  it('keeps naira in URLs and omits defaults', () => {
    expect(toUrlQuery(parseBrowseParams({}))).toBe('');
    expect(toUrlQuery(p)).toBe('q=phone&minPrice=2000&maxPrice=50000&page=3');
    expect(toUrlQuery(p, { page: 1 })).toBe('q=phone&minPrice=2000&maxPrice=50000');
  });
  it('detects active filters', () => {
    expect(hasActiveFilters(parseBrowseParams({}))).toBe(false);
    expect(hasActiveFilters(p)).toBe(true);
  });
});
