import { ContentPage } from '@/components/content/content-page';

export const metadata = { title: 'Terms of use', description: 'The rules for using SAZU Marketplace.' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ContentPage
      title="The ground rules"
      eyebrow="Terms of use"
      intro="A few clear expectations keep SAZU Marketplace useful, safe and fair for everyone."
      field="terms_text"
      fallbackText={'By using SAZU Marketplace, you agree to provide accurate information and use the platform lawfully. You are responsible for the accounts and content you create.\n\nListings must be truthful, legal and owned or legitimately offered by the seller. Do not post stolen goods, prohibited items, misleading prices or spam.\n\nSAZU Marketplace is a connection platform, not a party to transactions. Buyers and sellers arrange payment and collection themselves and should verify each other before meeting or paying.\n\nWe may remove listings or restrict accounts that create risk, break these rules or misuse the marketplace. You may stop using the service at any time.'}
    />
  );
}
