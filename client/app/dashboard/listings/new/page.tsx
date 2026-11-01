import { ListingEditor } from '@/components/seller/listing-editor';

export const metadata = { title: 'New listing', robots: { index: false } };

export default function Page() {
  return <ListingEditor />;
}
