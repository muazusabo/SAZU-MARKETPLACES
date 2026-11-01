'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from './auth-provider';

/**
 * Client-side convenience gate: redirects anonymous visitors to sign-in and returns them here afterwards.
 * It is not a security boundary: every private API endpoint independently requires a valid token.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="container max-w-2xl py-12" role="status" aria-label="Checking your session">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="mt-6 h-40" />
      </div>
    );
  }
  return <>{children}</>;
}
