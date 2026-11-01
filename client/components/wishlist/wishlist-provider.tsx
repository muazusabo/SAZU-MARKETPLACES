'use client';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import { ApiError } from '@/lib/api';
import { buyerApi } from '@/lib/buyer-api';
import { loginHref } from '@/lib/validation';

interface WishlistContextValue {
  has(productId: string): boolean;
  /** Saves or removes. Anonymous visitors are sent to sign in and returned to this page. */
  toggle(productId: string): Promise<void>;
  count: number;
}
const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status !== 'authenticated') { setIds(new Set()); return; }
    let cancelled = false;
    buyerApi.wishlistIds().then((list) => { if (!cancelled) setIds(new Set(list)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [status]);

  const toggle = useCallback(async (id: string) => {
    if (status === 'anonymous') { router.push(loginHref(pathname || '/')); return; }
    if (status !== 'authenticated') return;
    const wasSaved = ids.has(id);
    setIds((s) => { const n = new Set(s); if (wasSaved) n.delete(id); else n.add(id); return n; }); // optimistic
    try {
      if (wasSaved) await buyerApi.unsave(id); else await buyerApi.save(id);
      toast.success(wasSaved ? 'Removed from your wishlist.' : 'Saved to your wishlist.');
    } catch (e) {
      setIds((s) => { const n = new Set(s); if (wasSaved) n.add(id); else n.delete(id); return n; }); // roll back
      toast.error(e instanceof ApiError ? e.message : 'Could not update your wishlist.');
    }
  }, [status, ids, router, pathname]);

  const value = useMemo(() => ({ has: (id: string) => ids.has(id), toggle, count: ids.size }), [ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}
