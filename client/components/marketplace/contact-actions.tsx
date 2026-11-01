'use client';
import { MessageCircle, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import { WishlistButton } from '@/components/wishlist/wishlist-button';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { buyerApi } from '@/lib/buyer-api';
import { loginHref } from '@/lib/validation';
import { ShareButton } from './share-button';

interface Props { productId: string; title: string; sellerSlug: string; canContact: { allowed: boolean; reason: string | null } }

/**
 * Chat with Seller / I'm Interested. The server re-checks everything (sign-in, verified email, listing still public and
 * available, not your own listing); this component only provides the right guidance for each situation.
 */
export function ContactActions({ productId, title, sellerSlug, canContact }: Props) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState<'chat' | 'interested' | null>(null);
  const isOwner = user?.seller?.slug === sellerSlug;

  async function contact(interested: boolean) {
    if (status === 'anonymous') { router.push(loginHref(pathname || '/')); return; }
    if (user && !user.emailVerified) {
      toast.error('Verify your email address to message sellers.', { action: { label: 'Open account', onClick: () => router.push('/account') } });
      return;
    }
    setBusy(interested ? 'interested' : 'chat');
    try {
      const c = await buyerApi.startConversation(productId, interested);
      router.push(`/messages/${c.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open the conversation. Try again.');
      setBusy(null);
    }
  }

  const disabled = isOwner || !canContact.allowed || status === 'loading' || busy !== null;
  return (
    <div className="grid gap-3">
      {isOwner && <p role="status" className="rounded-lg border bg-card p-3 text-sm">This is your listing. Buyers can message you through the app.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" disabled={disabled} onClick={() => contact(false)}><MessageCircle />{busy === 'chat' ? 'Opening chat…' : 'Chat with Seller'}</Button>
        {!isOwner && <Button type="button" size="lg" variant="accent" disabled={disabled} onClick={() => contact(true)}><ThumbsUp />{busy === 'interested' ? 'Sending…' : 'I’m Interested'}</Button>}
      </div>
      {!canContact.allowed && <p className="text-sm text-muted-foreground">New messages are turned off for this listing. You can still save it or share it.</p>}
      {isOwner && <Button asChild variant="outline" className="justify-self-start"><Link href="/dashboard">Open seller dashboard</Link></Button>}
      {status === 'anonymous' && canContact.allowed && <p className="text-sm text-muted-foreground">You’ll be asked to sign in first, then brought straight back here.</p>}
      <div className="flex flex-wrap gap-2"><WishlistButton productId={productId} title={title} variant="full" /><ShareButton title={title} /></div>
    </div>
  );
}
