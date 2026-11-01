'use client';
import { PackageSearch, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function EmptyState({ title, text, action }: { title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <PackageSearch aria-hidden className="mx-auto size-9 text-muted-foreground" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground">{text}</p>
      {action && <Button asChild className="mt-5"><Link href={action.href}>{action.label}</Link></Button>}
    </div>
  );
}

export function ErrorState({ message = 'We couldn’t load listings right now.' }: { message?: string }) {
  const router = useRouter();
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
      <TriangleAlert aria-hidden className="mx-auto size-8 text-destructive" />
      <p className="mt-3 font-semibold">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button className="mt-4" variant="outline" onClick={() => router.refresh()}>Try again</Button>
    </div>
  );
}
