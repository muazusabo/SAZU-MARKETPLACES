'use client';
import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrowseParams, SORT_OPTIONS, hasActiveFilters, toUrlQuery } from '@/lib/browse-params';
import type { CategoryNode } from '@/lib/marketplace';
import { AVAILABILITY_LABELS, CONDITION_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const selectClass = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm';

export function BrowseFilters({ initial, categories }: { initial: BrowseParams; categories: CategoryNode[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initial.q ?? '');
  const [location, setLocation] = useState(initial.location ?? '');
  const [minPrice, setMinPrice] = useState(initial.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice?.toString() ?? '');
  const current = useRef(initial);
  current.current = initial;

  // Re-sync local text when the URL changes from outside (back button, "clear filters").
  useEffect(() => {
    setQ(initial.q ?? ''); setLocation(initial.location ?? '');
    setMinPrice(initial.minPrice?.toString() ?? ''); setMaxPrice(initial.maxPrice?.toString() ?? '');
  }, [initial.q, initial.location, initial.minPrice, initial.maxPrice]);

  function apply(overrides: Partial<BrowseParams>) {
    const qs = toUrlQuery(current.current, { ...overrides, page: 1 });
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Debounced text inputs: wait for the user to pause typing before hitting the API.
  useEffect(() => {
    const next = { q: q.trim() || undefined, location: location.trim() || undefined,
      minPrice: minPrice === '' ? undefined : Number(minPrice), maxPrice: maxPrice === '' ? undefined : Number(maxPrice) };
    const changed = next.q !== current.current.q || next.location !== current.current.location ||
      next.minPrice !== current.current.minPrice || next.maxPrice !== current.current.maxPrice;
    if (!changed || Number.isNaN(next.minPrice) || Number.isNaN(next.maxPrice)) return;
    const t = setTimeout(() => apply(next), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, location, minPrice, maxPrice]);

  const sort = initial.sort ?? (initial.q ? 'relevance' : 'newest');
  const sortOptions = SORT_OPTIONS.filter((o) => o.value !== 'relevance' || initial.q);

  return (
    <aside aria-label="Search and filters" className="grid content-start gap-4">
      <form role="search" onSubmit={(e) => { e.preventDefault(); apply({ q: q.trim() || undefined }); }} className="grid gap-1.5">
        <Label htmlFor="browse-q">Search</Label>
        <Input id="browse-q" type="search" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Textbooks, phones, food…" />
      </form>

      <Button type="button" variant="outline" className="lg:hidden" aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen((v) => !v)}>
        <SlidersHorizontal />Filters{hasActiveFilters({ ...initial, q: undefined }) ? ' (active)' : ''}
      </Button>

      <div id="filter-panel" className={cn('grid gap-4', open ? 'grid' : 'hidden', 'lg:grid')} aria-busy={pending}>
        <div className="grid gap-1.5">
          <Label htmlFor="f-category">Category</Label>
          <select id="f-category" className={selectClass} value={initial.category ?? ''} onChange={(e) => apply({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {categories.map((c) => c.children.length ? (
              <optgroup key={c.slug} label={c.name}>
                <option value={c.slug}>All {c.name}</option>
                {c.children.map((ch) => <option key={ch.slug} value={ch.slug}>{ch.name}</option>)}
              </optgroup>
            ) : <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold" id="price-label">Price (₦)</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="price-label">
            <Input inputMode="numeric" aria-label="Minimum price in naira" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/[^\d]/g, ''))} />
            <Input inputMode="numeric" aria-label="Maximum price in naira" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-condition">Condition</Label>
          <select id="f-condition" className={selectClass} value={initial.condition ?? ''} onChange={(e) => apply({ condition: e.target.value || undefined })}>
            <option value="">Any condition</option>
            {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-avail">Availability</Label>
          <select id="f-avail" className={selectClass} value={initial.availability ?? ''} onChange={(e) => apply({ availability: e.target.value || undefined })}>
            <option value="">Available or reserved</option>
            {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-type">Type</Label>
          <select id="f-type" className={selectClass} value={initial.type ?? ''} onChange={(e) => apply({ type: e.target.value || undefined })}>
            <option value="">Products and services</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-location">Campus location</Label>
          <Input id="f-location" maxLength={80} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Hostel A" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-sort">Sort by</Label>
          <select id="f-sort" className={selectClass} value={sort} onChange={(e) => apply({ sort: e.target.value })}>
            {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {hasActiveFilters(initial) && (
          <Button type="button" variant="ghost" onClick={() => startTransition(() => router.push(initial.seller ? `${pathname}?seller=${initial.seller}` : pathname, { scroll: false }))}>
            Clear filters
          </Button>
        )}
      </div>
    </aside>
  );
}
