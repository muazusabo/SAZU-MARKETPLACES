'use client';
import { Button } from '@/components/ui/button';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container py-24" role="alert">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 max-w-lg text-muted-foreground">
        The page failed to load. Try again, and if it keeps happening, come back in a few minutes.
      </p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
