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
    <footer className="border-t border-brand-deep/10 bg-brand-cream">
      <div className="container flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5 rounded-sm text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-brand-deep font-display text-xs font-extrabold text-brand-light-lime">SZ</span>
          <span className="font-display text-sm font-extrabold tracking-tight">SAZU <span className="font-semibold text-brand-deep/60">Marketplace</span></span>
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium sm:justify-end sm:text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="w-fit rounded-sm text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-brand-deep/10 py-3">
        <p className="container text-xs text-muted-foreground">© {new Date().getFullYear()} {SITE.name}</p>
      </div>
    </footer>
  );
}
