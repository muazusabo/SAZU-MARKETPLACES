import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Listing not available', robots: { index: false } };

export default function ProductNotFound() {
  return (
    <div className="container py-24">
      <h1 className="text-3xl font-bold">This listing isn’t available</h1>
      <p className="mt-3 max-w-lg text-muted-foreground">It may have been removed, expired, or the link may be wrong. Browse current listings instead.</p>
      <Button asChild className="mt-6"><Link href="/browse">Browse products</Link></Button>
    </div>
  );
}
