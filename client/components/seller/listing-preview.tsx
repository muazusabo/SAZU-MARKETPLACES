'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ProductView } from '@/components/marketplace/product-view';
import { ErrorState } from '@/components/marketplace/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { sellerApi } from '@/lib/seller-api';
import { ListingStatusBadge } from './status-badge';
import { SellerGate } from './seller-gate';

export function ListingPreview({ id }: { id: string }) {
  return <SellerGate allowPending>{() => <Inner id={id} />}</SellerGate>;
}

function Inner({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => sellerApi.get(id) });
  if (q.isLoading) return <div className="container py-8" role="status" aria-label="Loading preview"><Skeleton className="h-96" /></div>;
  if (q.isError || !q.data) return <div className="container py-8"><ErrorState message="We couldn’t load this listing." error={q.error} onRetry={() => { void q.refetch(); }} /></div>;
  const l = q.data;
  return (
    <div className="container py-8">
      <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-accent bg-card p-4">
        <p className="text-sm"><strong>Preview.</strong> This is how buyers will see your listing. Status: <ListingStatusBadge status={l.status} availability={l.availability} /></p>
        <Button asChild size="sm" variant="outline"><Link href={`/dashboard/listings/${l.id}/edit`}>Back to editing</Link></Button>
      </div>
      <ProductView p={l} preview />
    </div>
  );
}
