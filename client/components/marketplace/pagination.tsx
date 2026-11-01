import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Button asChild variant="outline"><Link href={hrefFor(page - 1)} rel="prev"><ChevronLeft />Previous</Link></Button>
      ) : <span />}
      <p className="text-sm text-muted-foreground" aria-live="polite">Page {page} of {totalPages}</p>
      {page < totalPages ? (
        <Button asChild variant="outline"><Link href={hrefFor(page + 1)} rel="next">Next<ChevronRight /></Link></Button>
      ) : <span />}
    </nav>
  );
}
