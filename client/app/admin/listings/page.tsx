import { ListingsPage } from '@/components/admin/listings-page';

export const metadata = { title: 'Listings', robots: { index: false } };

export default function Page() {
  return <ListingsPage />;
}
