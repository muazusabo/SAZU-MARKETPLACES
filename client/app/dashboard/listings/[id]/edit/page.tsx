import { ListingEditor } from '@/components/seller/listing-editor';

export const metadata = { title: 'Edit listing', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ListingEditor id={(await params).id} />;
}
