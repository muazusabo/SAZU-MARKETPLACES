import { BadgeCheck, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pagination } from '@/components/marketplace/pagination';
import { ProductGrid } from '@/components/marketplace/product-grid';
import { EmptyState, ErrorState } from '@/components/marketplace/states';
import { ReportButton } from '@/components/reports/report-button';
import { formatDate } from '@/lib/format';
import { fetchProducts, fetchStorefront } from '@/lib/marketplace';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await fetchStorefront((await params).slug).catch(() => null);
  if (!s) return { title: 'Storefront not found', robots: { index: false } };
  const description = s.description?.slice(0, 160) ?? `Products and services from ${s.shopName} on SAZU Marketplace.`;
  return { title: s.shopName, description, alternates: { canonical: `/seller/${s.slug}` }, openGraph: { title: s.shopName, description, type: 'website' } };
}

export default async function SellerPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = Math.max(1, Math.min(1000, Number.parseInt((await searchParams).page ?? '1', 10) || 1));
  let s;
  try { s = await fetchStorefront(slug); } catch { return <div className="container py-16"><ErrorState message="We couldn’t load this storefront." /></div>; }
  if (!s) notFound();
  const list = await fetchProducts(`seller=${s.slug}&page=${page}&pageSize=12`).catch(() => null);

  return (
    <div className="container py-8">
      <header className="flex flex-wrap items-start gap-4 rounded-lg border bg-card p-6">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary font-display text-2xl font-bold text-primary">{s.shopName.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold">{s.shopName}
            {s.verified && <span className="inline-flex items-center gap-1 rounded-sm bg-success/15 px-2 py-0.5 text-sm font-semibold text-success"><BadgeCheck aria-hidden className="size-4" />Verified seller</span>}
          </h1>
          {s.description && <p className="mt-2 max-w-2xl text-muted-foreground">{s.description}</p>}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {s.location && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3.5" />{s.location}</span>}
            <span>{s.activeProductCount} active {s.activeProductCount === 1 ? 'listing' : 'listings'}</span>
            {s.memberSince && <span>Active since {formatDate(s.memberSince)}</span>}
            {s.activityStatus && <span>Last seen: {s.activityStatus === 'today' ? 'Active today' : 'Active recently'}</span>}
          </p>
          <div className="mt-2"><ReportButton targetType="seller" targetId={s.id} label="Report seller" sellerSlug={s.slug} /></div>
          {s.categories.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Categories">
              {s.categories.map((c) => <li key={c.slug}><Link href={`/browse?seller=${s.slug}&category=${c.slug}`} className="rounded-sm bg-secondary px-2 py-1 text-sm font-medium hover:bg-secondary/70">{c.name}</Link></li>)}
            </ul>
          )}
        </div>
      </header>

      <section aria-label="Listings" className="mt-8">
        {!list ? <ErrorState /> : list.items.length === 0
          ? <EmptyState title="No active listings" text="This seller has nothing listed right now. Check back soon." action={{ href: '/browse', label: 'Browse all products' }} />
          : <><ProductGrid products={list.items} headingLevel={2} /><Pagination page={list.meta.page} totalPages={list.meta.totalPages} hrefFor={(n) => `/seller/${s.slug}?page=${n}`} /></>}
      </section>
    </div>
  );
}
