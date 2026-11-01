import { describe, expect, it } from 'vitest';
import { formatMessageTime } from './format';
import { MESSAGE_MAX, checkMessage, checkReport, loginHref, safeNextPath } from './validation';

describe('loginHref', () => {
  it('returns visitors to the same page after signing in', () => {
    const href = loginHref('/product/samsung-galaxy-a14');
    expect(href).toBe('/login?next=%2Fproduct%2Fsamsung-galaxy-a14');
    expect(safeNextPath(decodeURIComponent(href.split('next=')[1]!))).toBe('/product/samsung-galaxy-a14');
  });
  it('never carries an external or malformed destination', () => {
    expect(loginHref('https://evil.example')).toBe('/login?next=%2F');
    expect(loginHref('//evil.example')).toBe('/login?next=%2F');
  });
});

describe('checkMessage', () => {
  it('accepts and trims normal text, keeping line breaks', () => {
    expect(checkMessage('  Hello\r\nthere  ')).toEqual({ ok: true, body: 'Hello\nthere' });
  });
  it('rejects empty, whitespace-only and over-long messages', () => {
    expect(checkMessage('   \n ').ok).toBe(false);
    expect(checkMessage('x'.repeat(MESSAGE_MAX + 1)).ok).toBe(false);
    expect(checkMessage('x'.repeat(MESSAGE_MAX)).ok).toBe(true);
  });
});

describe('formatMessageTime', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  it('shows only the time for today (Lagos) and date plus time otherwise', () => {
    expect(formatMessageTime('2026-10-16T08:30:00Z', now)).toMatch(/9:30/);
    expect(formatMessageTime('2026-10-14T08:30:00Z', now)).toMatch(/14 Oct/);
    expect(formatMessageTime(null, now)).toBe('');
    expect(formatMessageTime('bad', now)).toBe('');
  });
});

describe('checkReport', () => {
  it('needs a valid reason; details are optional except for "other"', () => {
    expect(checkReport('', '').ok).toBe(false);
    expect(checkReport('bogus', '').ok).toBe(false);
    expect(checkReport('scam', '  ')).toEqual({ ok: true, details: undefined });
    expect(checkReport('scam', ' asked me to pay first ')).toEqual({ ok: true, details: 'asked me to pay first' });
    expect(checkReport('other', 'short').ok).toBe(false);
    expect(checkReport('other', 'This listing uses stolen photos.').ok).toBe(true);
    expect(checkReport('spam', 'x'.repeat(1001)).ok).toBe(false);
  });
});
