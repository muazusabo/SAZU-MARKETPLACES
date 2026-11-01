import { ListingPreview } from '@/components/seller/listing-preview';

export const metadata = { title: 'Preview listing', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ListingPreview id={(await params).id} />;
}
