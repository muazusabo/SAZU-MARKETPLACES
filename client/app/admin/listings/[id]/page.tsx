import { ListingDetail } from '@/components/admin/listings-page';

export const metadata = { title: 'Inspect listing', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ListingDetail id={(await params).id} />;
}
