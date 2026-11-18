import { ContentPage } from '@/components/content/content-page';

export const metadata = { title: 'About SAZU Marketplace', description: 'About the campus marketplace for Sa’adu Zungur University students.' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ContentPage
      title="Built for life on campus"
      eyebrow="About us"
      intro="SAZU Marketplace helps students discover useful goods and services from people within the campus community."
      field="about_text"
      fallbackText={'SAZU Marketplace is a simple, local marketplace for students of Sa’adu Zungur University, Gadau. Buy, sell and connect without leaving the campus community.\n\nWe make listings easy to find, help buyers and sellers start conversations, and keep marketplace activity focused on real student needs. Payments, collection and delivery are arranged directly between users, so always verify an item and a seller before paying.\n\nUse the marketplace responsibly: describe listings honestly, respect others, and report anything that breaks community rules.'}
    />
  );
}
