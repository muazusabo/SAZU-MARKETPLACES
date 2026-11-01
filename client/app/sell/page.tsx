import { BadgeCheck, Camera, ClipboardCheck, MessageCircle } from 'lucide-react';
import { SellCta } from '@/components/seller/sell-cta';
import { SITE } from '@/lib/site';

export const metadata = { title: 'Sell on SAZU Marketplace', description: 'Apply to sell products and services to students at Sa’adu Zungur University.' };

const STEPS = [
  { Icon: ClipboardCheck, title: 'Apply', text: 'Create an account, verify your email, and tell us about your shop and the categories you sell in.' },
  { Icon: BadgeCheck, title: 'Submit your shop', text: 'An administrator reviews your seller application. You can prepare listings while it is under review.' },
  { Icon: Camera, title: 'List with photos', text: 'Add details, category information and clear photos. Your listing goes live as soon as you publish it.' },
  { Icon: MessageCircle, title: 'Chat and agree', text: 'Buyers message you inside the app. You agree on payment and collection directly. We never handle money.' },
];

export default function SellPage() {
  return (
    <div className="container max-w-4xl py-12">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Sell to your campus</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">List textbooks, gadgets, food, fashion, hostel items, or your skills. Reach students at Sa’adu Zungur University directly.</p>
      <div className="mt-8"><SellCta /></div>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="rounded-lg border bg-card p-5">
            <Icon aria-hidden className="size-6 text-primary" />
            <h2 className="mt-3 text-lg font-bold">{i + 1}. {title}</h2>
            <p className="mt-1 text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
      <section aria-labelledby="rules-h" className="mt-12 rounded-lg bg-secondary p-6">
        <h2 id="rules-h" className="text-xl font-bold">What you can’t list</h2>
        <p className="mt-2 text-secondary-foreground/80">Stolen or counterfeit goods, illegal or dangerous items, unsafe food, leaked exam papers, services that help students cheat or impersonate others, and misleading ads. Listings that break the rules are removed.</p>
      </section>
      <p role="note" className="mt-8 rounded-lg border-l-4 border-accent bg-card p-4 text-sm text-muted-foreground">{SITE.paymentDisclaimer}</p>
    </div>
  );
}
