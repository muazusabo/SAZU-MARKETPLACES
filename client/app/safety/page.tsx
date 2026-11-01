import { ContentPage } from '@/components/content/content-page';
import { SITE } from '@/lib/site';

export const metadata = { title: 'Safety guidelines', description: 'Community guidelines and tips for trading safely on SAZU Marketplace.' };
export const dynamic = 'force-dynamic';

const TIPS = [
  'Meet in busy, public parts of campus and, if you can, bring a friend.',
  'Check the item properly before you pay. Pay only when you are satisfied.',
  'Keep conversations inside the app so reports can be reviewed.',
  'Never share passwords, bank PINs or one-time codes with anyone.',
  'Be wary of anyone asking you to pay first for something you haven’t seen.',
  'Report suspicious listings, sellers or messages with the Report buttons.',
];

export default function Page() {
  return (
    <ContentPage title="Safety guidelines" field="community_guidelines">
      <section aria-labelledby="tips-h" className="mt-10 rounded-lg bg-secondary p-6">
        <h2 id="tips-h" className="text-xl font-bold">Trading safely: general tips</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-secondary-foreground/90">{TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="mt-4 text-sm text-secondary-foreground/80">These are general safety suggestions, not university rules. {SITE.paymentDisclaimer}</p>
      </section>
    </ContentPage>
  );
}
