import { ContentPage } from '@/components/content/content-page';

export const metadata = { title: 'About SAZU Marketplace', description: 'About the campus marketplace for Sa’adu Zungur University students.' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ContentPage title="About SAZU Marketplace" field="about_text" />;
}
