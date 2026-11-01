import { describe, expect, it } from 'vitest';
import { paragraphs, safeEmail, safePhone } from './content';

describe('content helpers', () => {
  it('turns only well-formed contact details into links', () => {
    expect(safeEmail(' help@example.com ')).toBe('help@example.com');
    for (const bad of ['', undefined, 'not an email', 'a@b', 'javascript:alert(1)', '"><script>@x.com']) expect(safeEmail(bad)).toBeNull();
    expect(safePhone('+234 803 123 4567')).toBe('+234 803 123 4567');
    for (const bad of ['', undefined, 'call me', 'javascript:1', '12']) expect(safePhone(bad)).toBeNull();
  });
  it('splits administrator text into paragraphs', () => {
    expect(paragraphs('One.\n\n\nTwo line\nstill two.\n\n  ')).toEqual(['One.', 'Two line\nstill two.']);
  });
});
