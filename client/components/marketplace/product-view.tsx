import { BadgeCheck, ChevronRight, FileText, Info, MapPin, Store } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatListingId, formatNairaFromKobo } from '@/lib/format';
import { CONDITION_LABELS, TYPE_LABELS } from '@/lib/labels';
import type { ProductCardData, ProductDetail } from '@/lib/marketplace';
import { SITE } from '@/lib/site';
import { AvailabilityBadge } from './availability-badge';
import { ProductGallery } from './product-gallery';
import { ProductGrid } from './product-grid';
import { ReportButton } from '@/components/reports/report-button';
import { ContactActions } from './contact-actions';
import { ProductReviews } from './product-reviews';

/** The product page body. Shared by the public page and the seller's preview so they can never drift apart. */
export function ProductView({ p, more = [], recommendations = [], preview = false }: { p: Omit<ProductDetail, 'images'> & { images: { url: string; thumbUrl?: string; alt: string }[] }; more?: ProductCardData[]; recommendations?: ProductCardData[]; preview?: boolean }) {
  const unavailable = !p.canContact.allowed;
  const location = p.campusLocation ?? p.seller.location;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground sm:mb-8 sm:text-sm">
        <Link href="/browse" className="rounded-md px-1.5 py-1 transition-colors hover:bg-secondary hover:text-foreground">Browse</Link>
        {p.parentCategory && <><ChevronRight aria-hidden className="size-3.5 shrink-0" /><Link href={`/browse?category=${p.parentCategory.slug}`} className="rounded-md px-1.5 py-1 transition-colors hover:bg-secondary hover:text-foreground">{p.parentCategory.name}</Link></>}
        <ChevronRight aria-hidden className="size-3.5 shrink-0" />
        <Link href={`/browse?category=${p.category.slug}`} aria-current="page" className="rounded-md bg-secondary px-2 py-1 font-semibold text-foreground">{p.category.name}</Link>
      </nav>

      <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)] lg:gap-10 xl:gap-12">
        <ProductGallery images={p.images} />

        <div className="grid content-start gap-5 sm:gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <AvailabilityBadge availability={p.availability} />
              {p.condition && <Badge>{CONDITION_LABELS[p.condition] ?? p.condition}</Badge>}
              <Badge variant="warning" className={p.productType === 'service' ? '' : 'hidden'}>{TYPE_LABELS[p.productType]}</Badge>
            </div>
            <h1 className="mt-4 text-[1.75rem] font-extrabold leading-[1.12] tracking-tight sm:text-3xl lg:text-[2.5rem]">{p.title}</h1>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] p-4 sm:p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Price</p>
                <p className="mt-1 text-3xl font-extrabold leading-none tracking-tight text-primary sm:text-4xl">{formatNairaFromKobo(p.priceKobo)}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">Listed {formatDate(p.publishedAt)}</p>
            </div>
          </div>

          {unavailable && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-destructive/20 border-l-4 border-l-destructive bg-destructive/5 p-4 text-sm leading-relaxed font-medium">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />{p.canContact.reason ?? 'This listing is no longer available.'} You can still browse similar items.
            </p>
          )}

          {!preview && (
            <section aria-label="Contact and save listing" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <p className="mb-3 text-sm font-bold">Interested in this listing?</p>
              <ContactActions productId={p.id} title={p.title} sellerSlug={p.seller.slug} canContact={p.canContact} />
            </section>
          )}

          <section aria-label="Seller" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 font-display text-lg font-bold text-primary">{p.seller.shopName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sold by</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-base font-bold">
                  <Link href={`/seller/${p.seller.slug}`} className="truncate hover:underline">{p.seller.shopName}</Link>
                  {p.seller.verified && <BadgeCheck aria-label="Verified seller" className="size-5 shrink-0 text-success" />}
                </p>
                {p.seller.location && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin aria-hidden className="size-3.5 shrink-0" />{p.seller.location}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="text-xs leading-relaxed text-muted-foreground">
                {p.seller.activeSince && <p>On SAZU since {formatDate(p.seller.activeSince)}</p>}
                {p.seller.activityStatus && <p>{p.seller.activityStatus === 'today' ? 'Active today' : 'Active recently'}</p>}
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-full"><Link href={`/seller/${p.seller.slug}`}><Store />Visit storefront</Link></Button>
            </div>
          </section>

          {!preview && (
            <div className="flex flex-wrap gap-1">
              <ReportButton targetType="product" targetId={p.id} label="Report listing" sellerSlug={p.seller.slug} />
              <ReportButton targetType="seller" targetId={p.seller.id} label="Report seller" sellerSlug={p.seller.slug} />
            </div>
          )}

          <p role="note" className="rounded-xl border-l-4 border-accent bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">{SITE.paymentDisclaimer}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 sm:mt-14 sm:gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)] lg:gap-10 xl:gap-12">
        <section aria-labelledby="desc-h" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">About this item</p>
              <h2 id="desc-h" className="mt-0.5 text-2xl font-bold">Description</h2>
            </div>
          </div>
          <p className="mt-5 whitespace-pre-line break-words border-t pt-5 text-[15px] leading-7 text-foreground/85 sm:text-base sm:leading-8">{p.description}</p>
        </section>
        <section aria-labelledby="details-h">
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">At a glance</p>
            <h2 id="details-h" className="mt-0.5 text-2xl font-bold">Listing details</h2>
          </div>
          <dl className="divide-y rounded-2xl border bg-card text-sm shadow-sm">
            {[
              ...p.specifications.map((s) => [s.label, s.value] as const),
              ['Category', p.category.name] as const,
              ...(p.condition ? [['Condition', CONDITION_LABELS[p.condition] ?? p.condition] as const] : []),
              ...(location ? [['Location', location] as const] : []),
              ...(p.collectionInfo ? [['Collection / delivery', p.collectionInfo] as const] : []),
              ['Listing ID', formatListingId(p.id)] as const,
              ['Listed', formatDate(p.publishedAt)] as const,
              ['Views', String(p.viewCount)] as const,
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(7rem,.75fr)_minmax(0,1fr)] gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl even:bg-secondary/30 sm:px-5">
                <dt className="font-semibold leading-relaxed">{k}</dt>
                <dd className="break-words leading-relaxed text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {!preview && <ProductReviews slug={p.slug} sellerSlug={p.seller.slug} reviews={p.reviews ?? { count: 0, averageRating: 0, items: [] }} />}

      {more.length > 0 && (
        <section aria-labelledby="more-h" className="mt-12 sm:mt-16">
          <h2 id="more-h" className="mb-4 text-2xl font-bold sm:text-3xl">More from {p.seller.shopName}</h2>
          <ProductGrid products={more} />
        </section>
      )}
      {recommendations.length > 0 && (
        <section aria-labelledby="recommended-h" className="mt-12 rounded-3xl border bg-secondary/40 p-5 sm:mt-16 sm:p-8">
          <h2 id="recommended-h" className="text-2xl font-bold sm:text-3xl">More listings from other sellers</h2>
          <p className="mb-5 mt-1 text-sm leading-relaxed text-muted-foreground sm:mb-6">Similar listings from other sellers in {p.category.name}.</p>
          <ProductGrid products={recommendations} />
        </section>
      )}
    </>
  );
}
