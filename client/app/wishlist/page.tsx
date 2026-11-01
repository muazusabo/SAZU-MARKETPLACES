import { WishlistPage } from '@/components/wishlist/wishlist-page';

export const metadata = { title: 'Your wishlist', robots: { index: false } };

export default function Page() {
  return <WishlistPage />;
}
