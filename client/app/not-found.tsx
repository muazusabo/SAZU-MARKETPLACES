import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="container py-24">
      <h1 className="text-3xl font-bold">This page isn’t available yet</h1>
      <p className="mt-3 max-w-lg text-muted-foreground">
        The page you opened doesn’t exist, or it hasn’t been built yet. Head back to the homepage to keep browsing.
      </p>
      <Button asChild className="mt-6"><Link href="/">Back to home</Link></Button>
    </div>
  );
}
