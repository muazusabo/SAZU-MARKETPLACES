import Link from 'next/link';
import { SITE } from '@/lib/site';

export const metadata = { title: 'Help', description: 'How SAZU Marketplace works and where to get help.' };

const FAQ = [
  ['How do I buy something?', 'Open a listing, tap “Chat with Seller” or “I’m Interested”, and agree on payment and collection directly with the seller inside the app. SAZU Marketplace never handles money.'],
  ['How do I sell?', 'Create an account, verify your email, and apply on the Sell page. After approval you can list products and services with photos.'],
  ['Why can’t I message a seller?', 'You need to be signed in with a verified email. You also can’t start new conversations about items that are sold or unavailable, or with someone who has blocked you.'],
  ['How do I report a problem?', 'Use “Report listing”, “Report seller” or “Report conversation”. Reports are confidential.'],
  ['I forgot my password.', 'Use “Forgot your password?” on the sign-in page.'],
];

export default function Page() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-4xl font-extrabold">Help</h1>
      <dl className="mt-6 grid gap-4">{FAQ.map(([q, a]) => <div key={q} className="rounded-lg border bg-card p-4"><dt className="font-bold">{q}</dt><dd className="mt-1 text-muted-foreground">{a}</dd></div>)}</dl>
      <p role="note" className="mt-8 rounded-lg border-l-4 border-accent bg-card p-4 text-sm text-muted-foreground">{SITE.paymentDisclaimer}</p>
      <p className="mt-6">Still stuck? <Link href="/contact" className="font-semibold text-primary underline">Contact us</Link>.</p>
    </div>
  );
}
