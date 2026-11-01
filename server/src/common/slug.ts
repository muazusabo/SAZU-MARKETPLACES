import { randomBytes } from 'node:crypto';

export function slugify(text: string, max = 60): string {
  const s = text
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/g, '');
  return s || 'item';
}

const suffix = () => randomBytes(4).toString('hex').slice(0, 6);

/** Returns `base` if free, otherwise `base-xxxxxx`. Callers must still rely on the DB unique constraint. */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>, reserved: string[] = []): Promise<string> {
  const root = reserved.includes(base) ? `${base}-shop` : base;
  if (!(await taken(root))) return root;
  for (let i = 0; i < 8; i++) {
    const candidate = `${root.slice(0, 70)}-${suffix()}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root.slice(0, 60)}-${randomBytes(8).toString('hex')}`;
}
