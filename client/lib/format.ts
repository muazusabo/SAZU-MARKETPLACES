/**
 * Prices are stored as integer kobo (minor units) to avoid floating-point errors.
 * Display only: a listing price is never a payment request.
 */
const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatNairaFromKobo(kobo: number): string {
  if (!Number.isInteger(kobo) || kobo < 0) throw new RangeError('kobo must be a non-negative integer');
  return naira.format(kobo / 100);
}

export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) throw new RangeError('naira must be a non-negative number');
  return Math.round(naira * 100);
}

const dateFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

/** Dates are stored in UTC and shown in Nigerian time. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

export function formatListingId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const dateTimeFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });
const timeFmt = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** Time only for today (Lagos), otherwise date and time. */
export function formatMessageTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now);
  return sameDay ? timeFmt.format(d) : dateTimeFmt.format(d);
}
