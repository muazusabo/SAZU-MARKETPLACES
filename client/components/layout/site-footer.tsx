import Link from 'next/link';
import { SITE } from '@/lib/site';

const links = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/safety', label: 'Safety guidelines' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/help', label: 'Help' },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t-4 border-accent bg-primary text-primary-foreground">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border-[32px] border-primary-foreground/5" />
      <div className="container relative grid gap-8 py-12 md:grid-cols-[1.2fr_1fr]">
        <div className="max-w-md">
          <p className="font-display text-xl font-bold">{SITE.name}</p>
          <p className="mt-1 text-sm text-primary-foreground/75">{SITE.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">{SITE.paymentDisclaimer}</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-6 gap-y-2 text-sm sm:grid-cols-3 md:justify-self-end">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="w-fit rounded-sm py-1 text-primary-foreground/85 transition-colors hover:text-accent hover:underline focus-visible:ring-offset-primary">{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="relative border-t border-primary-foreground/15 bg-foreground/10 py-4">
        <p className="container text-xs leading-relaxed text-primary-foreground/70">
          SAZU Marketplace is an independent student marketplace and is not an official service of the university
          unless stated otherwise by the administrators.
        </p>
      </div>
    </footer>
  );
}
