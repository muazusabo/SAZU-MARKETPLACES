import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, Handshake, MessageCircle, Search } from 'lucide-react';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { HomeListings } from '@/components/home/home-listings';
import { SearchForm } from '@/components/home/search-form';
import { GridSkeleton } from '@/components/marketplace/product-grid';
import { fetchFreshPublicContent, PublicContent } from '@/lib/content';
import { fetchCategories } from '@/lib/marketplace';
import { CATEGORIES } from '@/lib/site';

export const dynamic = 'force-dynamic';

const HOME_CATEGORY_SLUGS = [
  'electronics',
  'food-drinks',
  'books-study-materials',
  'fashion-accessories',
  'hostel-room-essentials',
  'furniture',
  'sports-gaming',
  'student-services',
] as const;

const STEPS = [
  { Icon: Search, title: 'Discover Products', text: 'Browse through amazing student listings.' },
  { Icon: MessageCircle, title: 'Contact the Seller', text: 'Chat directly with the seller.' },
  { Icon: Handshake, title: 'Agree & Collect', text: 'Settle and get your item.' },
] as const;

const HERO_IMAGE_POSITIONS: Record<string, string> = {
  center: 'center',
  top: 'center top',
  bottom: 'center bottom',
  left: 'left center',
  right: 'right center',
};

export default async function HomePage() {
  const [categories, content] = await Promise.all([
    fetchCategories().catch(() => null),
    fetchFreshPublicContent().catch((error: unknown): PublicContent => {
      console.error('Unable to load public homepage settings.', error);
      return {};
    }),
  ]);
  const visibleCategories = HOME_CATEGORY_SLUGS.flatMap((slug) => {
    const platformCategory = CATEGORIES.find((category) => category.slug === slug);
    const apiCategory = categories?.find((category) => category.slug === slug);
    if (!platformCategory || (categories && !apiCategory)) return [];
    return [{ slug, name: apiCategory?.name ?? platformCategory.name, Icon: platformCategory.icon }];
  });

  return (
    <div className="pb-12">
      <section className="container pt-5 sm:pt-7">
        <div className="grid overflow-hidden rounded-3xl border border-border bg-brand-cream lg:min-h-[380px] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col justify-center px-5 py-8 sm:px-9 sm:py-10 lg:px-11">
            <p className="w-fit rounded-full bg-brand-light-lime px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand-deep">
              SAZU campus marketplace
            </p>
            <h1 className="mt-4 max-w-xl font-display text-[2.4rem] font-extrabold leading-[1.04] tracking-tight text-foreground sm:text-5xl">
              Buy. Sell. Connect.
              <span className="block text-primary">On Campus.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Discover great products, find services, and connect with fellow students at SAZU.
            </p>
            <div className="mt-5">
              <SearchForm />
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button asChild size="sm" className="h-10 rounded-full px-5">
                <Link href="/browse">Browse Products <ArrowRight aria-hidden /></Link>
              </Button>
              <Button asChild variant="accent" size="sm" className="h-10 rounded-full px-5">
                <Link href="/sell">Sell on SAZU</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              No online payments. Buyers and sellers arrange payment and collection directly.
            </p>
          </div>
          <div className="relative min-h-[250px] overflow-hidden sm:min-h-[320px] lg:m-3 lg:ml-0 lg:rounded-2xl">
            <Image
              src={content.homepage_hero_image_url || '/campus-scene.svg'}
              alt="Illustration of a student with books in front of a university campus"
              fill
              priority
              unoptimized
              sizes="(max-width: 1023px) 100vw, 55vw"
              className="object-cover"
              style={{ objectPosition: HERO_IMAGE_POSITIONS[content.homepage_hero_image_position ?? 'center'] ?? 'center' }}
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-deep/55 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 rounded-2xl border border-white/60 bg-white/95 px-4 py-3 shadow-lg sm:bottom-6 sm:left-6">
              <p className="text-sm font-bold text-brand-deep">Made for campus life</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Find what you need, right here.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="container mt-7 sm:mt-9">
        <div className="rounded-3xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-light-lime text-brand-deep">
                <BookOpen aria-hidden className="size-5" />
              </span>
              <h2 id="categories-heading" className="font-display text-xl font-bold sm:text-2xl">Popular Categories</h2>
            </div>
            <Link href="/categories" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline">
              View all <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-8">
            {visibleCategories.map(({ slug, name, Icon }, index) => (
              <li key={slug} className="w-[132px] shrink-0 snap-start sm:w-auto">
                <Link
                  href={`/browse?category=${slug}`}
                  className="group flex h-[112px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-brand-cream/70 px-2 text-center transition-colors hover:border-primary/30 hover:bg-brand-light-lime/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={`grid size-11 place-items-center rounded-xl ${index % 2 === 0 ? 'bg-brand-light-lime' : 'bg-white'} text-brand-deep transition-transform group-hover:-translate-y-0.5`}>
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="line-clamp-2 text-xs font-bold leading-tight text-foreground sm:text-[11px] xl:text-xs">{name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Suspense fallback={<div className="container mt-8"><GridSkeleton count={4} /></div>}>
        <HomeListings />
      </Suspense>

      <section aria-labelledby="how-heading" className="container mt-7 sm:mt-9">
        <div className="rounded-3xl border border-brand-light-lime bg-brand-cream px-5 py-5 sm:px-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="how-heading" className="font-display text-xl font-extrabold sm:text-2xl">How It Works</h2>
              <p className="mt-1 text-sm text-muted-foreground">Get started in three simple steps.</p>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-right">
              Buyers and sellers connect directly to agree on payment and collection. SAZU Marketplace does not process payments.
            </p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3 md:gap-0">
            {STEPS.map(({ Icon, title, text }, index) => (
              <li key={title} className={`flex items-center gap-3 sm:px-4 md:py-1 ${index > 0 ? 'md:border-l md:border-brand-deep/15' : ''}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-deep font-display text-sm font-bold text-white">{index + 1}</span>
                <Icon aria-hidden className="size-6 shrink-0 text-brand-deep" />
                <span>
                  <span className="block text-sm font-extrabold">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
