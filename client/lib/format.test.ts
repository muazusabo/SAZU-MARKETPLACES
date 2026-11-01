import { describe, expect, it } from 'vitest';
import { formatDate, formatListingId, formatNairaFromKobo, nairaToKobo } from './format';

describe('naira formatting', () => {
  it('formats whole naira', () => {
    expect(formatNairaFromKobo(150000)).toMatch(/1,500/);
    expect(formatNairaFromKobo(150000)).toMatch(/₦|NGN/);
  });
  it('keeps kobo precision', () => {
    expect(formatNairaFromKobo(150050)).toMatch(/1,500\.5/);
  });
  it('converts naira to integer kobo without float drift', () => {
    expect(nairaToKobo(19.99)).toBe(1999);
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
  });
  it('rejects invalid input', () => {
    expect(() => formatNairaFromKobo(-1)).toThrow(RangeError);
    expect(() => formatNairaFromKobo(1.5)).toThrow(RangeError);
    expect(() => nairaToKobo(NaN)).toThrow(RangeError);
  });
});

describe('formatDate', () => {
  it('shows Nigerian local dates and tolerates bad input', () => {
    expect(formatDate('2026-10-14T23:30:00Z')).toMatch(/15 Oct 2026/); // 00:30 in Lagos (UTC+1)
    expect(formatDate(null)).toBe('');
    expect(formatDate('nonsense')).toBe('');
  });

  describe('formatListingId', () => {
    it('shows a short, readable prefix instead of the full UUID', () => {
      expect(formatListingId('3b241101-e2bb-4255-8caf-4136c566a962')).toBe('3B241101');
    });
  });
});
