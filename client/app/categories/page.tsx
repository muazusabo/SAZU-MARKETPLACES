import Link from 'next/link';
import { ErrorState } from '@/components/marketplace/states';
import { fetchCategories } from '@/lib/marketplace';
import { CATEGORIES } from '@/lib/site';

export const metadata = { title: 'Categories', description: 'Browse every category on SAZU Marketplace.' };

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const tree = await fetchCategories().catch(() => null);
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold">Categories</h1>
      {!tree ? <div className="mt-6"><ErrorState message="We couldn’t load categories." /></div> : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((c) => {
            const Icon = CATEGORIES.find((x) => x.slug === c.slug)?.icon;
            return (
              <li key={c.slug} className="rounded-lg border bg-card p-5">
                <Link href={`/browse?category=${c.slug}`} className="flex items-center gap-3 font-display text-lg font-bold hover:underline">
                  {Icon && <span className="grid size-10 place-items-center rounded-md bg-secondary text-primary"><Icon aria-hidden className="size-5" /></span>}
                  {c.name}
                </Link>
                <p className="mt-2 text-sm text-muted-foreground">{c.productCount} {c.productCount === 1 ? 'listing' : 'listings'}</p>
                {c.children.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {c.children.map((ch) => (
                      <li key={ch.slug}><Link href={`/browse?category=${ch.slug}`} className="rounded-sm bg-secondary px-2 py-1 text-sm font-medium hover:bg-secondary/70">{ch.name} ({ch.productCount})</Link></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
