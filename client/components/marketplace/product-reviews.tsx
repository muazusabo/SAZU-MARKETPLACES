'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { authedFetch, jsonBody } from '@/lib/auth-client';
import { loginHref } from '@/lib/validation';
import { formatDate } from '@/lib/format';
import type { ProductReview } from '@/lib/marketplace';

interface Props {
  slug: string;
  sellerSlug: string;
  reviews: { count: number; averageRating: number; items: ProductReview[] };
}

export function ProductReviews({ slug, sellerSlug, reviews }: Props) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(reviews.items);
  const [summary, setSummary] = useState({ count: reviews.count, averageRating: reviews.averageRating });
  const owner = user?.seller?.slug === sellerSlug;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'anonymous') {
      router.push(loginHref(pathname || `/product/${slug}`));
      return;
    }
    if (!user?.emailVerified) {
      toast.error('Verify your email address before posting a review.', {
        action: { label: 'Open account', onClick: () => router.push('/account') },
      });
      return;
    }

    setBusy(true);
    try {
      const created = await authedFetch<ProductReview>(`/products/${encodeURIComponent(slug)}/reviews`, jsonBody('POST', { rating, body }));
      setItems((current) => [created, ...current]);
      setSummary((current) => ({
        count: current.count + 1,
        averageRating: (current.averageRating * current.count + created.rating) / (current.count + 1),
      }));
      setBody('');
      toast.success('Your review has been added.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not submit your review. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reviews-title" className="mt-12 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-2xl font-bold">Reviews</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.count ? `${summary.averageRating.toFixed(1)} out of 5 · ${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
          </p>
        </div>
        {summary.count > 0 && (
          <div className="flex items-center gap-1 text-accent" aria-label={`${summary.averageRating.toFixed(1)} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden className={`size-5 ${i < Math.round(summary.averageRating) ? 'fill-current' : ''}`} />)}
          </div>
        )}
      </div>

      {!owner && (
        <form onSubmit={submit} className="mt-5 grid gap-3 rounded-xl bg-secondary/60 p-4">
          <fieldset>
            <legend className="text-sm font-semibold">Your rating</legend>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: 5 }, (_, i) => {
                const value = i + 1;
                return (
                  <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value}>
                    <Star aria-hidden className={`size-6 ${value <= rating ? 'fill-accent text-accent' : 'text-muted-foreground'}`} />
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="grid gap-1.5 text-sm font-semibold">
            Share your experience
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              rows={4}
              className="rounded-md border bg-background px-3 py-2 font-normal"
              placeholder="Write at least 10 characters..."
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">One review per listing. Your email must be verified.</p>
            <Button type="submit" disabled={busy || status === 'loading' || body.trim().length < 10}>
              {busy ? 'Posting…' : 'Post review'}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6 grid gap-4">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Be the first to share a review.</p>
        ) : items.map((review) => (
          <article key={review.id} className="border-b pb-4 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{review.author}</p>
              <time dateTime={review.createdAt} className="text-sm text-muted-foreground">{formatDate(review.createdAt)}</time>
            </div>
            <p className="mt-1 flex items-center gap-1 text-accent" aria-label={`${review.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden className={`size-4 ${i < review.rating ? 'fill-current' : ''}`} />)}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{review.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
