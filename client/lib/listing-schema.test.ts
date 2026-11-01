import { describe, expect, it } from 'vitest';
import { koboToNairaString, listingSchema, listingToPayload, nairaStringToKobo, validateImageFile } from './listing-schema';

describe('nairaStringToKobo', () => {
  it.each([['1', 100], ['1,500', 150000], ['₦12,500.5', 1250050], ['19.99', 1999], ['0.1', null], ['0', null], ['', null], ['abc', null], ['1.234', null], ['-5', null], ['1e5', null]])(
    '%s -> %s', (i, o) => expect(nairaStringToKobo(i)).toBe(o));
  it('round-trips', () => { expect(koboToNairaString(150000)).toBe('1500'); expect(koboToNairaString(1250050)).toBe('12500.50'); });
});

const base = { title: 'Samsung A14', description: 'Barely used with box.', categorySlug: 'electronics', productType: 'product' as const,
  priceNaira: '125,000', condition: 'used_good', campusLocation: '', collectionInfo: '', attributes: { brand: 'Samsung', stale: 'old' } };

describe('listingSchema / payload', () => {
  it('accepts a valid listing', () => expect(listingSchema.safeParse(base).success).toBe(true));
  it('flags each invalid field', () => {
    const r = listingSchema.safeParse({ ...base, title: 'ab', description: 'short', categorySlug: '', priceNaira: '0.5' });
    expect(r.success).toBe(false);
    const paths = !r.success ? r.error.issues.map((i) => i.path[0]) : [];
    expect(paths).toEqual(expect.arrayContaining(['title', 'description', 'categorySlug', 'priceNaira']));
  });
  it('builds an API payload in kobo, drops stale attributes and blank optionals, and nulls condition for services', () => {
    expect(listingToPayload(base, ['brand'])).toMatchObject({ priceKobo: 12500000, condition: 'used_good', campusLocation: null, attributes: { brand: 'Samsung' } });
    expect(listingToPayload({ ...base, productType: 'service' }, ['brand']).condition).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('accepts normal photos and explains problems', () => {
    expect(validateImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateImageFile({ name: 'a.gif', type: 'image/gif', size: 1000 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/larger than 5 MB/);
    expect(validateImageFile({ name: 'e.png', type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});
