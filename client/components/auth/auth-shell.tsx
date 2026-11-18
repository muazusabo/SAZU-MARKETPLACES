import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';

export function AuthShell({
  title,
  intro,
  children,
  branded = false,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  branded?: boolean;
}) {
  if (branded) {
    return (
      <main className="container relative isolate grid min-h-[calc(100svh-8rem)] place-items-center overflow-hidden py-8 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -left-28 top-16 -z-10 size-72 rounded-full bg-brand-light-lime/70 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 bottom-8 -z-10 size-80 rounded-full bg-brand-cream blur-3xl" />
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-brand-deep/10 bg-white shadow-[0_28px_90px_-40px_rgba(6,78,59,0.38)] md:grid-cols-[0.82fr_1.18fr]">
          <aside className="relative isolate overflow-hidden bg-brand-deep px-6 py-7 text-white sm:px-9 sm:py-9 md:flex md:min-h-[650px] md:flex-col md:justify-between md:px-8 md:py-9 lg:px-11 lg:py-11">
            <div aria-hidden className="absolute -right-20 -top-20 -z-10 size-64 rounded-full border-[36px] border-white/[0.04]" />
            <div aria-hidden className="absolute -bottom-28 -left-24 -z-10 size-72 rounded-full border-[44px] border-brand-lime/10" />
            <div>
              <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:ring-offset-brand-deep">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-brand-lime font-display text-sm font-extrabold text-brand-deep">SZ</span>
                <span className="font-display text-lg font-extrabold tracking-tight">SAZU <span className="font-medium text-white/65">Marketplace</span></span>
              </Link>
              <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold tracking-wide text-brand-light-lime">
                <Sparkles aria-hidden className="size-3.5" />
                MADE FOR CAMPUS LIFE
              </p>
              <h2 className="mt-4 max-w-md font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                Your campus is full of <span className="text-brand-lime">possibilities.</span>
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70 sm:text-base">
                Find what you need, share what you have, and connect with students around you.
              </p>
            </div>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:mt-8 lg:grid-cols-1">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-lime/15 text-brand-lime"><GraduationCap aria-hidden className="size-5" /></span>
                <span className="text-sm font-medium text-white/90">Built around student life</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-lime/15 text-brand-lime"><ShieldCheck aria-hidden className="size-5" /></span>
                <span className="text-sm font-medium text-white/90">Connect directly with people</span>
              </div>
            </div>
            <div className="relative mt-6 hidden overflow-hidden rounded-2xl border border-white/10 bg-brand-cream sm:block lg:mt-9">
              <Image
                src="/campus-scene.svg"
                alt=""
                width={900}
                height={600}
                className="h-40 w-full object-cover sm:h-48 lg:h-52"
                priority
              />
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-brand-deep shadow-sm">
                <BadgeCheck aria-hidden className="size-3.5" />
                A marketplace for your community
              </span>
            </div>
            <p className="mt-5 hidden items-center gap-1 text-xs text-white/50 lg:flex">
              Discover. Connect. Make campus yours.
              <ArrowUpRight aria-hidden className="size-3.5" />
            </p>
          </aside>
          <section className="px-5 py-7 sm:px-9 sm:py-10 lg:px-12 lg:py-12">
            <header className="mb-6 sm:mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Welcome to SAZU</p>
              <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h1>
              {intro && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">{intro}</p>}
            </header>
            {children}
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="container grid max-w-md gap-6 py-12 sm:py-16">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="font-semibold">{message}</p>
    </div>
  );
}
