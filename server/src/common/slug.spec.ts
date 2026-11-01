import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it.each([
    ['Samsung Galaxy A14 (128GB)!', 'samsung-galaxy-a14-128gb'],
    ['  Jollof   Rice & Chicken ', 'jollof-rice-chicken'],
    ['Crème brûlée', 'creme-brulee'],
    ['!!!', 'item'],
    ['', 'item'],
  ])('%s -> %s', (i, o) => expect(slugify(i)).toBe(o));
  it('caps length without trailing hyphen', () => {
    const s = slugify('word '.repeat(40), 30);
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('uses the base when free, suffixes when taken, avoids reserved words', async () => {
    expect(await uniqueSlug('lamp', async () => false)).toBe('lamp');
    const taken = new Set(['lamp']);
    const s = await uniqueSlug('lamp', async (x) => taken.has(x));
    expect(s).toMatch(/^lamp-[0-9a-f]{6}$/);
    expect(await uniqueSlug('me', async () => false, ['me'])).toBe('me-shop');
  });
});
