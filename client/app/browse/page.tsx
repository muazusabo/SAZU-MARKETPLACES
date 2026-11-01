import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BrowseFilters } from '@/components/marketplace/browse-filters';
import { GridSkeleton, ProductGrid } from '@/components/marketplace/product-grid';
import { Pagination } from '@/components/marketplace/pagination';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { hasActiveFilters, parseBrowseParams, toApiQuery, toUrlQuery, BrowseParams } from '@/lib/browse-params';
import { CategoryNode, fetchCategories, fetchProducts } from '@/lib/marketplace';

type SP = Promise<Record<string, string | string[] | undefined>>;

function findCategory(tree: CategoryNode[], slug?: string): CategoryNode | undefined {
  for (const c of tree) { if (c.slug === slug) return c; const ch = c.children.find((x) => x.slug === slug); if (ch) return ch; }
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = parseBrowseParams(await searchParams);
  const cats = await fetchCategories().catch(() => []);
  const cat = findCategory(cats, p.category);
  const title = p.q ? `Search: ${p.q}` : cat ? cat.name : 'Browse products';
  const filtered = Boolean(p.q || p.seller || p.minPrice !== undefined || p.maxPrice !== undefined || p.condition || p.availability || p.type || p.location || p.sort || p.page > 1);
  return {
    title,
    description: cat?.description ?? 'Browse products and services from student sellers at Sa’adu Zungur University.',
    alternates: { canonical: p.category ? `/browse?category=${p.category}` : '/browse' },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

async function Results({ params }: { params: BrowseParams }) {
  let data;
  try { data = await fetchProducts(toApiQuery(params)); } catch { return <ErrorState />; }
  const { items, meta } = data;
  if (items.length === 0) {
    return hasActiveFilters(params)
      ? <EmptyState title="No listings match your search" text="Try different keywords, widen the price range, or clear some filters." action={{ href: '/browse', label: 'Clear all filters' }} />
      : <EmptyState title="No listings yet" text="Listings from approved student sellers will appear here. Be the first to sell something." action={{ href: '/sell', label: 'Start selling' }} />;
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">{meta.total} {meta.total === 1 ? 'listing' : 'listings'}</p>
      <ProductGrid products={items} headingLevel={2} />
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(n) => `/browse?${toUrlQuery(params, { page: n })}`} />
    </>
  );
}

export default async function BrowsePage({ searchParams }: { searchParams: SP }) {
  const params = parseBrowseParams(await searchParams);
  const categories = await fetchCategories().catch(() => []);
  const heading = findCategory(categories, params.category)?.name ?? 'Browse products';
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold">{heading}</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <BrowseFilters initial={params} categories={categories} />
        <section aria-label="Results">
          <Suspense key={toUrlQuery(params)} fallback={<GridSkeleton />}>
            <Results params={params} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
