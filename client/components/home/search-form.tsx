'use client';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SearchForm() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim().slice(0, 100);
    router.push(term ? `/browse?q=${encodeURIComponent(term)}` : '/browse');
  }

  return (
    <form onSubmit={onSubmit} role="search" className="flex w-full max-w-2xl gap-2 rounded-lg bg-card p-2 shadow-sm">
      <label htmlFor="hero-search" className="sr-only">Search products and services</label>
      <div className="relative flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="hero-search"
          type="search"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search textbooks, phones, food, services"
          className="h-12 w-full rounded-md bg-transparent pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <Button type="submit" variant="accent" size="lg">Search</Button>
    </form>
  );
}
