import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ProductCardData } from '@/lib/marketplace';
import { ProductGrid } from './product-grid';

export function ProductSection({ title, href, products, note }: { title: string; href: string; products: ProductCardData[]; note?: string }) {
  if (!products.length) return null;
  return (
    <section aria-label={title} className="container mt-16">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
          {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">View all <ArrowRight aria-hidden className="size-4" /></Link>
      </div>
      <ProductGrid products={products} />
    </section>
  );
}
