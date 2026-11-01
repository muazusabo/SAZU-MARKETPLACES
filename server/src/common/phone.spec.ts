import { normalizeNigerianPhone } from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['2349012345678', '+2349012345678'],
    ['0701-234-5678', '+2347012345678'],
  ])('accepts %s', (input, out) => expect(normalizeNigerianPhone(input)).toBe(out));

  it.each(['12345', '0603123456', '+1 415 555 0100', '080312345678', 'abc', ''])('rejects %s', (v) =>
    expect(normalizeNigerianPhone(v)).toBeNull(),
  );
});
