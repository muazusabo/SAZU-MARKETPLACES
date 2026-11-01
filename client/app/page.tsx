import Link from 'next/link';
import { ArrowRight, MessageCircle, ShieldCheck, Store, Search, HandCoins, Package } from 'lucide-react';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { HomeListings } from '@/components/home/home-listings';
import { GridSkeleton } from '@/components/marketplace/product-grid';
import { fetchCategories } from '@/lib/marketplace';
import { SearchForm } from '@/components/home/search-form';
import { CATEGORIES, SITE } from '@/lib/site';

// Rendered on demand (listing fetches are still cached ~30s) so a build never bakes in an empty/error state.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Categories come from the database (administrator-managed); fall back to the brief's list if the API is unreachable.
  const fromApi = await fetchCategories().catch(() => null);
  const categories = fromApi
    ? fromApi.map((c) => ({ slug: c.slug, name: c.name, icon: CATEGORIES.find((x) => x.slug === c.slug)?.icon ?? Package }))
    : CATEGORIES;
  return (
    <>
      <section className="bg-primary text-primary-foreground">
        <div className="container flex flex-col items-center py-12 text-center sm:py-16">
          <p className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-4 py-1.5 text-sm font-semibold">
            {SITE.tagline}
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
            Find it on campus. Sell it on SAZU.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
            Discover student listings, find campus essentials, and connect directly with sellers at Sa&apos;adu Zungur University.
          </p>
          <div className="mt-7 w-full max-w-3xl"><SearchForm /></div>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/75">
            No online payments. Buyers and sellers arrange payment, collection, and delivery directly.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {categories.slice(0, 5).map(({ slug, name }) => (
              <Link
                key={slug}
                href={`/browse?category=${slug}`}
                className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-primary-foreground/20"
              >
                {name}
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent" size="lg"><Link href="/browse">Browse products</Link></Button>
            <Button asChild size="lg" className="border border-primary-foreground/40 bg-transparent hover:bg-primary-foreground/10">
              <Link href="/sell">Sell on SAZU</Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="container mt-14">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Explore the marketplace</p>
          <h2 id="categories-heading" className="mt-1 text-2xl font-bold sm:text-3xl">Shop by category</h2>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map(({ slug, name, icon: Icon }) => (
            <li key={slug}>
              <Link
                href={`/browse?category=${slug}`}
                className="flex h-full items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary hover:bg-secondary sm:p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary sm:size-10">
                  <Icon aria-hidden className="size-4 sm:size-5" />
                </span>
                <span className="text-sm font-semibold leading-snug sm:text-base">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<div className="container mt-16"><GridSkeleton count={4} /></div>}>
        <HomeListings />
      </Suspense>

      <section aria-labelledby="how-heading" className="container mt-20">
        <h2 id="how-heading" className="text-2xl font-bold sm:text-3xl">How SAZU Marketplace works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { Icon: Search, title: 'Find what you need', text: 'Search or browse listings from student sellers. Product pages are open to everyone, no account needed.' },
            { Icon: MessageCircle, title: 'Message the seller', text: 'Sign in and chat privately inside the app. Your phone number stays private unless you choose to share it.' },
            { Icon: HandCoins, title: 'Agree and meet', text: 'You and the seller settle payment, collection, or delivery directly. SAZU Marketplace never handles money.' },
          ].map(({ Icon, title, text }, i) => (
            <li key={title} className="rounded-lg border bg-card p-5">
              <Icon aria-hidden className="size-6 text-primary" />
              <h3 className="mt-3 text-lg font-bold">{i + 1}. {title}</h3>
              <p className="mt-1 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sell-heading" className="container mt-20 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-secondary p-6 sm:p-8">
          <Store aria-hidden className="size-7 text-primary" />
          <h2 id="sell-heading" className="mt-3 text-2xl font-bold">Become a seller</h2>
          <p className="mt-2 text-secondary-foreground/80">
            Create an account, apply for a seller profile with your shop name and categories, and list products or
            services once approved. Review requirements are set by the marketplace administrators.
          </p>
          <Button asChild className="mt-5"><Link href="/sell">How selling works <ArrowRight /></Link></Button>
        </div>
        <div className="rounded-lg border bg-card p-6 sm:p-8">
          <ShieldCheck aria-hidden className="size-7 text-success" />
          <h2 className="mt-3 text-2xl font-bold">Community safety</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>Meet in busy, public parts of campus.</li>
            <li>Check the item before you pay.</li>
            <li>Keep conversations inside the app so reports can be reviewed.</li>
            <li>Report suspicious listings or sellers. Stolen, counterfeit and exam-leak items are not allowed.</li>
          </ul>
          <Link href="/safety" className="mt-4 inline-block font-semibold text-primary underline-offset-4 hover:underline">
            Read the safety guidelines
          </Link>
        </div>
      </section>

    </>
  );
}
