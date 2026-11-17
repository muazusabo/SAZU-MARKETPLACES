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
    <footer className="mt-0 border-t border-brand-deep bg-brand-deep text-white">
      <div className="container grid gap-8 py-9 md:grid-cols-[1.1fr_1fr] md:items-center md:py-10">
        <div className="max-w-md">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-sm focus-visible:ring-offset-brand-deep">
            <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-white font-display text-sm font-extrabold text-brand-deep">SZ</span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-extrabold">SAZU</span>
              <span className="block text-[10px] font-semibold tracking-[0.12em] text-white/75">MARKETPLACE</span>
            </span>
          </Link>
          <p className="mt-3 text-sm text-white/75">{SITE.description}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">{SITE.paymentDisclaimer}</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-6 gap-y-2 text-sm sm:grid-cols-3 md:justify-self-end">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="w-fit rounded-sm py-1 text-white/75 transition-colors hover:text-brand-lime hover:underline focus-visible:ring-offset-brand-deep">{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10 bg-black/10 py-4">
        <p className="container text-xs leading-relaxed text-white/60">
          SAZU Marketplace is an independent student marketplace and is not an official service of the university
          unless stated otherwise by the administrators.
        </p>
      </div>
    </footer>
  );
}
