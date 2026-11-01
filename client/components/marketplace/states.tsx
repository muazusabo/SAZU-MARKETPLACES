'use client';
import { CircleHelp, PackageSearch, ShieldAlert, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';

interface StateAction { href: string; label: string }

export function EmptyState({
  title,
  text,
  action,
  suggestions = [],
}: {
  title: string;
  text: string;
  action?: StateAction;
  suggestions?: StateAction[];
}) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <PackageSearch aria-hidden className="mx-auto size-9 text-muted-foreground" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground">{text}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {action && <Button asChild><Link href={action.href}>{action.label}</Link></Button>}
        {suggestions.map((item) => (
          <Button key={item.href} asChild variant="outline"><Link href={item.href}>{item.label}</Link></Button>
        ))}
      </div>
    </div>
  );
}

function errorCopy(error?: unknown, message?: string): { title: string; detail: string; permissionDenied?: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 0 && typeof navigator !== 'undefined' && !navigator.onLine) {
      return { title: 'You’re offline', detail: 'Reconnect to the internet, then try again.' };
    }
    if (error.kind === 'timeout') {
      return { title: 'This is taking longer than expected', detail: 'Your request timed out. Check your connection and retry; your unsaved form draft is kept on this device.' };
    }
    if (error.status === 0) return { title: 'Couldn’t reach the marketplace', detail: 'Check your internet connection and confirm the marketplace server is available, then try again.' };
    if (error.status === 401) return { title: 'Sign in to continue', detail: 'Your session may have expired. Sign in again to continue; saved form drafts on this device will remain available.' };
    if (error.status === 403) return { title: 'You don’t have permission', detail: error.message || 'This action is limited to another account role. Return to a page you can access.', permissionDenied: true };
    if (error.status === 404) return { title: 'This page or item is no longer available', detail: error.message || 'It may have been removed or its address may have changed.' };
    if (error.status === 429) return { title: 'Please wait before trying again', detail: 'Too many requests were made in a short time. Wait a moment, then retry.' };
    if (error.status >= 500) return { title: 'The marketplace server had a problem', detail: 'Your request could not be completed. Try again shortly; if it continues, contact support.' };
    return { title: 'We couldn’t complete that request', detail: error.message || 'Check the information and try again.' };
  }
  return {
    title: message ?? 'We couldn’t load this information',
    detail: 'Check your connection and the information you entered, then try again. If the problem continues, contact marketplace support.',
  };
}

export function ErrorState({
  message,
  error,
  onRetry,
}: {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const copy = errorCopy(error, message);
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
      {copy.permissionDenied ? <ShieldAlert aria-hidden className="mx-auto size-8 text-destructive" /> : <TriangleAlert aria-hidden className="mx-auto size-8 text-destructive" />}
      <h2 className="mt-3 font-semibold">{copy.title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{copy.detail}</p>
      {error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 401 && !copy.permissionDenied && (
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">Details: {error.message}</p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>Try again</Button>
        {copy.permissionDenied && <Button asChild><Link href="/">Back to marketplace</Link></Button>}
        {error instanceof ApiError && error.status === 401 && <Button asChild><Link href="/login">Sign in</Link></Button>}
      </div>
      {error instanceof ApiError && error.requestId && <p className="mt-3 text-xs text-muted-foreground">Support reference: {error.requestId}</p>}
    </div>
  );
}

export function PermissionDenied({ message = 'You don’t have permission to view this page.' }: { message?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-card p-8 text-center">
      <ShieldAlert aria-hidden className="mx-auto size-9 text-destructive" />
      <h2 className="mt-3 text-xl font-bold">Access restricted</h2>
      <p className="mx-auto mt-1 max-w-lg text-muted-foreground">{message}</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild><Link href="/">Back to marketplace</Link></Button>
        <Button asChild variant="outline"><Link href="/contact"><CircleHelp aria-hidden />Get help</Link></Button>
      </div>
    </div>
  );
}
