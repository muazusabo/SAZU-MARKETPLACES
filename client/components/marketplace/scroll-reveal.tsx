'use client';

import { ReactNode, useEffect, useRef } from 'react';

/** Reveals sections once they enter the viewport; content stays visible when motion or observers are unavailable. */
export function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.classList.add('motion-reveal-ready');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        node.classList.add('motion-reveal-visible');
        observer.unobserve(node);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    const frame = requestAnimationFrame(() => observer.observe(node));
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <div ref={ref} className={`motion-reveal ${className}`}>{children}</div>;
}
