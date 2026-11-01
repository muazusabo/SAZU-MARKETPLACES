'use client';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/marketplace/states';
import { Skeleton } from '@/components/ui/skeleton';
import { sellerApi } from '@/lib/seller-api';
import { ListingForm } from './listing-form';
import { SellerGate } from './seller-gate';

export function ListingEditor({ id }: { id?: string }) {
  return <SellerGate allowPending>{() => (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-bold">{id ? 'Edit listing' : 'New listing'}</h1>
      {id ? <Loaded id={id} /> : <ListingForm />}
    </div>
  )}</SellerGate>;
}

function Loaded({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => sellerApi.get(id) });
  if (q.isLoading) return <div role="status" aria-label="Loading listing"><Skeleton className="h-10" /><Skeleton className="mt-4 h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this listing." error={q.error} onRetry={() => { void q.refetch(); }} />;
  return <ListingForm key={q.data.id} listing={q.data} />;
}
