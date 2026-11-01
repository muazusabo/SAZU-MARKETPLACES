'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireAuth } from '@/components/auth/require-auth';
import { useAuth } from '@/components/auth/auth-provider';
import { ErrorState } from '@/components/marketplace/states';
import { SellerMe, sellerApi } from '@/lib/seller-api';

export const sellerQueryKey = ['seller-me'] as const;
export const useSellerMe = () => {
  const { status } = useAuth();
  return useQuery({ queryKey: sellerQueryKey, queryFn: sellerApi.me, enabled: status === 'authenticated' });
};

function StatusPanel({ seller }: { seller: SellerMe | null }) {
  const { user } = useAuth();
  if (!seller) {
    return (
      <Panel title="Become a seller" text="Submit your shop details to apply. Seller applications are reviewed separately; once you can manage listings, each one goes live as soon as you publish it.">
        {user && !user.emailVerified
          ? <p className="text-sm font-medium">Verify your email address first. Open your account page to resend the link.</p>
          : <Button asChild><Link href="/sell/apply">Apply to sell</Link></Button>}
      </Panel>
    );
  }
  const copy = {
    draft: ['Your application is saved as a draft', 'Finish your shop details and submit it for review.'],
    pending: ['Your application is awaiting review', 'You can create and publish listings while your application is under review.'],
    rejected: ['Your application was not approved', seller.reviewNote ?? 'Update your details and submit again.'],
    suspended: ['Your seller account is suspended', seller.reviewNote ?? 'Contact support if you think this is a mistake.'],
    approved: ['', ''],
  }[seller.status];
  return (
    <Panel title={copy[0]!} text={copy[1]!}>
      {seller.status !== 'suspended' && <Button asChild><Link href="/dashboard/settings">{seller.status === 'pending' ? 'Edit shop details' : 'Update application'}</Link></Button>}
    </Panel>
  );
}

function Panel({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="container max-w-2xl py-12">
      <div role="status" className="rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{text}</p>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/** Signed-in gate plus seller status check. Real permission checks happen on the API for every request. */
export function SellerGate({ children, allowUnapproved = false, allowPending = false }: { children: (seller: SellerMe) => React.ReactNode; allowUnapproved?: boolean; allowPending?: boolean }) {
  return <RequireAuth><Inner allowUnapproved={allowUnapproved} allowPending={allowPending}>{children}</Inner></RequireAuth>;
}

function Inner({ children, allowUnapproved, allowPending }: { children: (seller: SellerMe) => React.ReactNode; allowUnapproved: boolean; allowPending: boolean }) {
  const q = useSellerMe();
  if (q.isLoading) return <div className="container py-12" role="status" aria-label="Loading"><Skeleton className="h-8 w-1/3" /><Skeleton className="mt-6 h-48" /></div>;
  if (q.isError) return <div className="container py-12"><ErrorState message="We couldn’t load your seller account." error={q.error} onRetry={() => { void q.refetch(); }} /></div>;
  const seller = q.data ?? null;
  if (!seller || (seller.status !== 'approved' && !(allowPending && seller.status === 'pending') && !(allowUnapproved && seller.status !== 'suspended'))) return <StatusPanel seller={seller} />;
  return <>{children(seller)}</>;
}
