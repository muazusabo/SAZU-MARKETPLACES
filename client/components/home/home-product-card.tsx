import { ArrowRight, BadgeCheck, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { WishlistButton } from '@/components/wishlist/wishlist-button';
import { AvailabilityBadge } from '@/components/marketplace/availability-badge';
import { formatNairaFromKobo } from '@/lib/format';
import { CONDITION_LABELS } from '@/lib/labels';
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
        <p className="mt-2 text-base font-extrabold leading-tight text-primary sm:text-lg">{formatNairaFromKobo(product.priceKobo)}</p>
        <div className="flex flex-wrap gap-1">
          {product.availability !== 'available' && <AvailabilityBadge availability={product.availability} />}
          {product.condition && <Badge>{CONDITION_LABELS[product.condition] ?? product.condition}</Badge>}
          {product.productType === 'service' && <Badge variant="warning">Service</Badge>}
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={product.seller.shopName}>
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-primary">
            {product.seller.shopName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{product.seller.shopName}</span>
          {product.seller.verified && <BadgeCheck aria-label="Verified seller" className="size-3.5 shrink-0 text-success" />}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={product.campusLocation || 'SAZU campus'}>
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
