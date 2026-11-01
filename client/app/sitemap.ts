import type { MetadataRoute } from 'next';
import { fetchCategories, fetchSitemap } from '@/lib/marketplace';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/browse`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: 'daily', priority: 0.6 },
  ];
  try {
    const [map, cats] = await Promise.all([fetchSitemap(), fetchCategories()]);
    for (const c of cats.flatMap((c) => [c, ...c.children])) entries.push({ url: `${base}/browse?category=${c.slug}`, changeFrequency: 'daily', priority: 0.7 });
    for (const p of map.products) entries.push({ url: `${base}/product/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.8 });
    for (const s of map.sellers) entries.push({ url: `${base}/seller/${s.slug}`, lastModified: s.updatedAt, changeFrequency: 'weekly', priority: 0.5 });
  } catch { /* API unavailable at build time: publish static entries only */ }
  return entries;
}
