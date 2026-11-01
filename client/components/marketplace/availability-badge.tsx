import { Badge } from '@/components/ui/badge';
import { AVAILABILITY_LABELS } from '@/lib/labels';

const VARIANT = { available: 'success', reserved: 'warning', sold: 'destructive', unavailable: 'destructive' } as const;

export function AvailabilityBadge({ availability }: { availability: string }) {
  return <Badge variant={VARIANT[availability as keyof typeof VARIANT] ?? 'default'}>{AVAILABILITY_LABELS[availability] ?? availability}</Badge>;
}
