import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { WishlistButton } from '@/components/wishlist/wishlist-button';
import { formatNairaFromKobo } from '@/lib/format';
import type { ProductCardData } from '@/lib/marketplace';
import { ProductImage } from '@/components/marketplace/product-image';

export function HomeProductCard({ product }: { product: ProductCardData }) {
  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage image={product.image} className="aspect-[4/3] w-full" />
        <WishlistButton productId={product.id} title={product.title} />
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <p className="truncate text-[11px] font-semibold text-muted-foreground">{product.category.name}</p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-snug">
          <Link href={`/product/${product.slug}`} className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
            {product.title}
          </Link>
        </h3>
        <p className="mt-2 text-lg font-extrabold leading-none text-primary">{formatNairaFromKobo(product.priceKobo)}</p>
        <p className="mt-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{product.campusLocation || 'SAZU campus'}</span>
        </p>
        <Link
          href={`/product/${product.slug}`}
          className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View Details <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}
