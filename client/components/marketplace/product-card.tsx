import { BadgeCheck, MapPin, Star } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatNairaFromKobo } from '@/lib/format';
import { CONDITION_LABELS } from '@/lib/labels';
import type { ProductCardData } from '@/lib/marketplace';
import { WishlistButton } from '@/components/wishlist/wishlist-button';
import { AvailabilityBadge } from './availability-badge';
import { ProductImage } from './product-image';

/** The whole card is clickable: the title link stretches over it. */
export function ProductCard({ product: p, headingLevel = 3 }: { product: ProductCardData; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const muted = p.availability === 'sold' || p.availability === 'unavailable';
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[transform,border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 motion-reduce:transition-none">
      <WishlistButton productId={p.id} title={p.title} />
      <ProductImage image={p.image} className={`aspect-[4/3] w-full ${muted ? 'opacity-60' : ''}`} />
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.category.name}</p>
        <Heading className="font-display text-base font-bold leading-snug">
          <Link href={`/product/${p.slug}`} className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-['']">
            {p.title}
          </Link>
        </Heading>
        <p className="text-xl font-extrabold text-primary">{formatNairaFromKobo(p.priceKobo)}</p>
        {!!p.reviewCount && p.reviewCount > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star aria-hidden className="size-3.5 fill-current text-accent" />
            <span>{(p.averageRating ?? 0).toFixed(1)} ({p.reviewCount})</span>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {p.availability !== 'available' && <AvailabilityBadge availability={p.availability} />}
          {p.condition && <Badge>{CONDITION_LABELS[p.condition] ?? p.condition}</Badge>}
          {p.productType === 'service' && <Badge variant="warning">Service</Badge>}
        </div>
        <div className="mt-auto grid gap-0.5 pt-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5 truncate">
            {p.seller.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.seller.avatarUrl} alt="" className="size-7 shrink-0 rounded-full bg-muted object-cover" />
              : <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-primary">{p.seller.shopName.slice(0, 1).toUpperCase()}</span>}
            <span className="truncate">{p.seller.shopName}</span>
            {p.seller.verified && <BadgeCheck aria-label="Verified seller" className="size-4 shrink-0 text-success" />}
          </p>
          {p.campusLocation && <p className="flex items-center gap-1 truncate"><MapPin aria-hidden className="size-3.5 shrink-0" />{p.campusLocation}</p>}
        </div>
      </div>
    </article>
  );
}
