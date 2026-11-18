import { AlertTriangle, Mail, MessageCircle, Phone } from 'lucide-react';
import { loadContent } from '@/components/content/content-page';
import { safeEmail, safePhone } from '@/lib/content';

export const metadata = { title: 'Contact us', description: 'How to reach the SAZU Marketplace team.' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const c = await loadContent();
  const email = safeEmail(c?.support_email); const phone = safePhone(c?.support_phone);
  return (
    <div className="container max-w-4xl py-10 sm:py-14">
      <header className="relative overflow-hidden rounded-3xl bg-primary px-6 py-8 text-primary-foreground sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-16 size-48 rounded-full border border-accent/25" />
        <p className="relative text-xs font-bold uppercase tracking-[0.22em] text-accent">Contact</p>
        <h1 className="relative mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">How can we help?</h1>
        <p className="relative mt-4 max-w-xl text-sm leading-7 text-primary-foreground/75 sm:text-base">
          Reach the marketplace team or report a concern from the listing or conversation involved.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {email ? (
          <a href={`mailto:${email}`} className="group flex min-h-32 items-start gap-4 rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-cream text-primary"><Mail aria-hidden /></span>
            <span><span className="block text-sm font-bold">Email support</span><span className="mt-1 block break-all text-sm text-primary group-hover:underline">{email}</span></span>
          </a>
        ) : (
          <div className="flex min-h-32 items-start gap-4 rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><Mail aria-hidden /></span>
            <span><span className="block text-sm font-bold text-foreground">Email support</span><span className="mt-1 block text-sm">No support email has been published yet.</span></span>
          </div>
        )}

        {phone ? (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="group flex min-h-32 items-start gap-4 rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-cream text-primary"><Phone aria-hidden /></span>
            <span><span className="block text-sm font-bold">Call or WhatsApp</span><span className="mt-1 block text-sm text-primary group-hover:underline">{phone}</span></span>
          </a>
        ) : (
          <div className="flex min-h-32 items-start gap-4 rounded-2xl border border-dashed bg-card p-5 text-muted-foreground">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><Phone aria-hidden /></span>
            <span><span className="block text-sm font-bold text-foreground">Phone support</span><span className="mt-1 block text-sm">No phone number has been published yet.</span></span>
          </div>
        )}
      </div>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <MessageCircle aria-hidden className="text-primary" />
          <h2 className="mt-3 font-bold">Listing or seller issue</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Open the listing or profile and use the Report button. Include enough detail for the moderation team to review it.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <AlertTriangle aria-hidden className="text-primary" />
          <h2 className="mt-3 font-bold">Immediate safety concern</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Do not continue a risky transaction. Use the in-app Report option and contact the appropriate campus or emergency service.</p>
        </div>
      </section>
    </div>
  );
}
