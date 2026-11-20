import { ArrowRight, ShoppingBag, Store } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { fetchProducts, type ProductCardData } from '@/lib/marketplace';
import { HomeProductCard } from './home-product-card';
import { AdSlot } from '@/components/advertisements/ad-slot';
import { ScrollReveal } from '@/components/marketplace/scroll-reveal';

function SellerPromo() {
  return (
    <aside className="relative flex min-h-64 flex-col justify-between overflow-hidden rounded-3xl bg-brand-light-lime p-5 sm:p-6 lg:min-h-full">
      <div className="relative z-10 max-w-[19rem]">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-deep/70">For student sellers</p>
        <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight text-brand-deep sm:text-[1.7rem]">
          Become a Seller on SAZU
        </h3>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-brand-deep/80">
          Turn your items or skills into income. Start selling today!
        </p>
      </div>
      <div aria-hidden className="absolute bottom-4 right-3 grid size-32 place-items-center rounded-3xl bg-white/70 text-brand-deep sm:bottom-5 sm:right-5 sm:size-36">
        <Store className="size-[4.5rem] stroke-[1.4]" />
        <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-xl bg-brand-lime text-brand-deep shadow-sm">
          <ShoppingBag className="size-5" />
        </span>
      </div>
      <Button asChild size="sm" className="relative z-10 mt-6 h-10 w-fit rounded-full px-5">
        <Link href="/sell">Start Selling <ArrowRight aria-hidden /></Link>
      </Button>
    </aside>
  );
}

export async function HomeListings() {
  let products: ProductCardData[] = [];
  let failure: unknown;

  try {
    products = (await fetchProducts('sort=popular&pageSize=4')).items;
  } catch (error) {
    failure = error;
  }

  return (
    <ScrollReveal className="container mt-7 sm:mt-9"><section aria-labelledby="deals-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Fresh finds from campus</p>
          <h2 id="deals-heading" className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Hot Deals</h2>
        </div>
        <Link href="/browse" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline">
          View all products <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <AdSlot placement="sponsored_product" className="mt-4" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {failure ? (
            <ErrorState message="We couldn’t load listings right now." error={failure} />
          ) : products.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {products.map((product, index) => (
                <li key={product.id} className="min-w-0">
                  <HomeProductCard product={product} priority={index < 2} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-48 flex-col justify-center rounded-3xl border border-dashed border-border bg-white px-5 py-6 sm:px-7">
              <p className="font-display text-lg font-bold">No listings just yet</p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                Approved student listings will appear here as soon as sellers post them.
              </p>
              <Link href="/browse" className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-bold text-primary hover:underline">
                Explore all products <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          )}
        </div>
        <SellerPromo />
      </div>
    </section></ScrollReveal>
  );
}
