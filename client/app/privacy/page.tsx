import { ContentPage } from '@/components/content/content-page';

export const metadata = { title: 'Privacy policy', description: 'How SAZU Marketplace handles your information.' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ContentPage
      title="Your data, clearly explained"
      eyebrow="Privacy"
      intro="We collect only what we need to operate the marketplace and protect the community."
      field="privacy_text"
      fallbackText={'We use account details, listings, messages and support reports to provide and improve SAZU Marketplace. We also use basic technical information to keep the service secure and reliable.\n\nYour information is shared only when needed to operate the platform, protect users, meet legal obligations or support a transaction you initiate. We do not sell personal information.\n\nYou can request help updating or removing account information through the contact page. Avoid posting sensitive details in listings or public messages.'}
    >
      <section aria-labelledby="analytics-privacy-h" className="mt-8 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="analytics-privacy-h" className="text-xl font-bold">Aggregate website analytics</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          We use a random identifier stored in your browser to estimate unique visitors since tracking began and visitors
          active within the last two minutes. The analytics record stores a server-keyed hash of that identifier, not
          page paths or IP addresses. Clearing your browser storage or using another browser may count you as a new visitor.
        </p>
      </section>
    </ContentPage>
  );
}
