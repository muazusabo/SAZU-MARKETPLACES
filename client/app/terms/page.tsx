import { ContentPage } from '@/components/content/content-page';

export const metadata = { title: 'Terms of use', description: 'The rules for using SAZU Marketplace.' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ContentPage title="Terms of use" field="terms_text" />;
}
