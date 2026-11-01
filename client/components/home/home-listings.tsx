import { ErrorState, EmptyState } from '@/components/marketplace/states';
import { ProductSection } from '@/components/marketplace/section';
import { fetchProducts, ProductCardData } from '@/lib/marketplace';
import { AFFORDABLE_MAX_NAIRA } from '@/lib/site';
import { formatNairaFromKobo } from '@/lib/format';

const SECTIONS = [
  { key: 'recent', title: 'Recently listed', query: 'sort=newest', href: '/browse?sort=newest', note: 'From approved student sellers.' },
  { key: 'popular', title: 'Most viewed this month', query: 'sort=popular', href: '/browse', note: 'Based on real listing views in the last 30 days.' },
  { key: 'affordable', title: 'Affordable student essentials', query: `maxPriceKobo=${AFFORDABLE_MAX_NAIRA * 100}&sort=newest`,
    href: `/browse?maxPrice=${AFFORDABLE_MAX_NAIRA}`, note: `Under ${formatNairaFromKobo(AFFORDABLE_MAX_NAIRA * 100)}.` },
  { key: 'food', title: 'Food and drinks', query: 'category=food-drinks', href: '/browse?category=food-drinks' },
  { key: 'books', title: 'Books and study materials', query: 'category=books-study-materials', href: '/browse?category=books-study-materials' },
  { key: 'services', title: 'Student services', query: 'category=student-services', href: '/browse?category=student-services' },
] as const;

/** Every section is real data from the API; sections with no listings are simply not shown. */
export async function HomeListings() {
  const results = await Promise.allSettled(SECTIONS.map((s) => fetchProducts(`${s.query}&pageSize=4`)));
  if (results.every((r) => r.status === 'rejected')) {
    return <div className="container mt-16"><ErrorState message="We couldn’t load listings right now." /></div>;
  }
  const lists: ProductCardData[][] = results.map((r) => (r.status === 'fulfilled' ? r.value.items : []));
  if (lists.every((l) => l.length === 0)) {
    return (
      <div className="container mt-16">
        <EmptyState title="No listings yet" text="Approved student sellers will list products and services here. Be one of the first to sell on SAZU Marketplace." action={{ href: '/sell', label: 'Start selling' }} />
      </div>
    );
  }
  return <>{SECTIONS.map((s, i) => <ProductSection key={s.key} title={s.title} href={s.href} note={'note' in s ? s.note : undefined} products={lists[i] ?? []} />)}</>;
}
