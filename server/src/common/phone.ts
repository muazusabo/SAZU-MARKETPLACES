/**
 * Normalises Nigerian mobile numbers to E.164 (+234XXXXXXXXXX).
 * Accepts 0803 123 4567, +234 803 123 4567, 2348031234567. Returns null when invalid.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let national: string;
  if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else return null;
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}
