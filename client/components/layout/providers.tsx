'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { VisitorTracker } from '@/components/analytics/visitor-tracker';
import { AuthProvider } from '@/components/auth/auth-provider';
import { VerificationLinkRecovery } from '@/components/auth/verification-link-recovery';
import { RealtimeProvider } from '@/components/realtime/realtime-provider';
import { WishlistProvider } from '@/components/wishlist/wishlist-provider';
import { NetworkStatus } from '@/components/ui/network-status';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <VerificationLinkRecovery />
        <RealtimeProvider>
          <WishlistProvider>
            <VisitorTracker />
            <NetworkStatus />
            {children}
          </WishlistProvider>
        </RealtimeProvider>
      </AuthProvider>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
