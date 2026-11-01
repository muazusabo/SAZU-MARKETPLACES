'use client';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSellerMe } from './seller-gate';

export function SellCta() {
  const { status, user } = useAuth();
  const seller = useSellerMe();
  if (status === 'loading' || (status === 'authenticated' && seller.isLoading)) return <Skeleton className="h-11 w-56" />;
  if (status === 'anonymous') {
    return <div className="flex flex-wrap gap-2"><Button asChild size="lg" variant="accent"><Link href="/register">Create an account</Link></Button><Button asChild size="lg" variant="outline"><Link href="/login?next=/sell/apply">Sign in to apply</Link></Button></div>;
  }
  if (user && !user.emailVerified) return <p role="status" className="font-medium">Verify your email to apply. <Link href="/account" className="text-primary underline">Open your account</Link>.</p>;
  const s = seller.data;
  if (!s) return <Button asChild size="lg" variant="accent"><Link href="/sell/apply">Apply to become a seller</Link></Button>;
  if (s.status === 'approved') return <Button asChild size="lg" variant="accent"><Link href="/dashboard">Go to your dashboard</Link></Button>;
  if (s.status === 'pending') return <div className="grid gap-2"><p role="status" className="font-medium">Your application is awaiting review. You can publish listings now.</p><Button asChild size="lg" variant="accent" className="justify-self-start"><Link href="/dashboard">Go to your dashboard</Link></Button></div>;
  const label = { draft: 'Finish your application', rejected: 'Update and resubmit your application', suspended: 'Your seller account is suspended' }[s.status];
  return <div className="grid gap-2"><p role="status" className="font-medium">{label}</p>{s.status !== 'suspended' && <Button asChild size="lg" variant="outline" className="justify-self-start"><Link href="/dashboard/settings">Open shop settings</Link></Button>}</div>;
}
