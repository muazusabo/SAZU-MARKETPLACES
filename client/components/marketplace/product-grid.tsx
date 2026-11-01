import { Skeleton } from '@/components/ui/skeleton';
import type { ProductCardData } from '@/lib/marketplace';
import { ProductCard } from './product-card';

/** `headingLevel` is the level of each card title: 2 on pages where the cards sit directly under the page's h1, otherwise 3. */
export function ProductGrid({ products, headingLevel = 3 }: { products: ProductCardData[]; headingLevel?: 2 | 3 }) {
  return (
    <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => <li key={p.slug} className="contents"><ProductCard product={p} headingLevel={headingLevel} /></li>)}
    </ul>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading listings" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border bg-card">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="grid gap-2 p-4"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}
