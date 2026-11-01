import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductView } from '@/components/marketplace/product-view';
import { ErrorState } from '@/components/marketplace/states';
import { ViewTracker } from '@/components/marketplace/view-tracker';
import { formatNairaFromKobo } from '@/lib/format';
import { fetchProduct, fetchProducts } from '@/lib/marketplace';

type Params = Promise<{ slug: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchProduct(slug).catch(() => null);
  if (!p) return { title: 'Listing not available', robots: { index: false } };
  const description = `${formatNairaFromKobo(p.priceKobo)} · ${p.description.replace(/\s+/g, ' ').slice(0, 140)}`;
  const image = p.images[0]?.url;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/product/${p.slug}` },
    // Only public listing data: never seller contact details.
    openGraph: { title: p.title, description, type: 'website', url: `/product/${p.slug}`, images: image ? [{ url: image, alt: p.images[0]?.alt }] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: p.title, description },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  let p;
  try { p = await fetchProduct(slug); } catch (error) { return <div className="container py-16"><ErrorState message="We couldn’t load this listing." error={error} /></div>; }
  if (!p) notFound();

  const [more, recommendations] = await Promise.all([
    fetchProducts(`seller=${p.seller.slug}&exclude=${p.slug}&pageSize=4`).then((r) => r.items).catch(() => []),
    fetchProducts(`category=${p.category.slug}&exclude=${p.slug}&excludeSeller=${p.seller.slug}&pageSize=12`).then((r) => r.items).catch(() => []),
  ]);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.description.slice(0, 500),
    image: p.images.map((i) => i.url),
    offers: {
      '@type': 'Offer', priceCurrency: 'NGN', price: (p.priceKobo / 100).toFixed(2),
      availability: p.availability === 'available' ? 'https://schema.org/InStock' : p.availability === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/LimitedAvailability',
    },
  };

  return (
    <div className="container mx-auto max-w-[1440px] py-6 sm:py-8 lg:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ViewTracker slug={p.slug} />

      <ProductView p={p} more={more} recommendations={recommendations} />
    </div>
  );
}
