'use client';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWishlist } from './wishlist-provider';

/** `icon` sits on product cards (above the stretched card link); `full` is the labelled button on the product page. */
export function WishlistButton({ productId, title, variant = 'icon' }: { productId: string; title: string; variant?: 'icon' | 'full' }) {
  const { has, toggle } = useWishlist();
  const saved = has(productId);
  if (variant === 'full') {
    return (
      <Button type="button" variant="outline" aria-pressed={saved} onClick={() => void toggle(productId)}>
        <Heart className={cn(saved && 'fill-destructive text-destructive')} />{saved ? 'Saved' : 'Save to Wishlist'}
      </Button>
    );
  }
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? `Remove “${title}” from wishlist` : `Save “${title}” to wishlist`}
      onClick={() => void toggle(productId)}
      className="absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-full bg-card/95 shadow-sm transition-colors hover:bg-card">
      <Heart aria-hidden className={cn('size-5', saved ? 'fill-destructive text-destructive' : 'text-foreground')} />
    </button>
  );
}
