import { Badge } from '@/components/ui/badge';

export function ListingStatusBadge({ status, availability }: { status: string; availability?: string }) {
  if (status === 'published') {
    if (availability === 'sold') return <Badge variant="destructive">Sold</Badge>;
    if (availability === 'unavailable') return <Badge variant="destructive">Unavailable</Badge>;
    if (availability === 'reserved') return <Badge variant="warning">Reserved</Badge>;
    return <Badge variant="success">Live</Badge>;
  }
  const map: Record<string, [string, 'default' | 'warning' | 'destructive']> = {
    draft: ['Draft', 'default'], pending_review: ['In review', 'warning'], rejected: ['Rejected', 'destructive'],
    archived: ['Archived', 'default'], removed: ['Removed', 'destructive'],
  };
  const [label, variant] = map[status] ?? [status, 'default'];
  return <Badge variant={variant}>{label}</Badge>;
}
