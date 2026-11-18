import Link from 'next/link';
import { fetchPublicContent, paragraphs, PublicContent } from '@/lib/content';

export async function loadContent(): Promise<PublicContent | null> {
  try { return await fetchPublicContent(); } catch { return null; }
}

/**
 * Renders administrator-published copy when available, with a concise built-in fallback for an unconfigured site.
 * Content is rendered as plain paragraphs (never as HTML).
 */
export async function ContentPage({
  title,
  field,
  eyebrow = 'SAZU Marketplace',
  intro = 'Useful information for the campus marketplace community.',
  fallbackText = '',
  children,
}: {
  title: string;
  field: keyof PublicContent;
  eyebrow?: string;
  intro?: string;
  fallbackText?: string;
  children?: React.ReactNode;
}) {
  const content = await loadContent();
  const publishedText = content?.[field]?.trim();
  const text = publishedText || (content ? fallbackText : '');
  return (
    <div className="container max-w-4xl py-10 sm:py-14">
      <header className="relative overflow-hidden rounded-3xl bg-primary px-6 py-8 text-primary-foreground sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-16 size-48 rounded-full border border-accent/25" />
        <div className="absolute -bottom-24 right-12 size-56 rounded-full border border-white/10" />
        <p className="relative text-xs font-bold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        <h1 className="relative mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="relative mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">{intro}</p>
      </header>

      <article className="mt-6 rounded-3xl border bg-card p-6 sm:p-8">
        {text ? (
          <div className="grid gap-5 leading-7 text-foreground/80">{paragraphs(text).map((p, i) => (
            <p key={i} className="whitespace-pre-line">{p}</p>
          ))}</div>
        ) : (
          <p role="status" className="rounded-2xl border border-dashed p-5 text-muted-foreground">
            We couldn’t load this page right now. Please try again shortly.{' '}
            <Link href="/contact" className="font-semibold text-primary underline">See how to contact us</Link>.
          </p>
        )}
        {children}
      </article>
    </div>
  );
}
