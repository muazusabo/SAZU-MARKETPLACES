import { z } from 'zod';

/** Mirrors the API rules (the API remains the source of truth and re-validates everything). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let national: string;
  if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else return null;
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}

const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || normalizeNigerianPhone(v) !== null, 'Enter a valid Nigerian mobile number, e.g. 0803 123 4567.');

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(100),
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters.').max(40, 'Keep it under 40 characters.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password,
  phone: optionalPhone,
  campusArea: z.string().trim().max(80, 'Keep it under 80 characters.'),
  acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms and community guidelines.'),
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: loginSchema.shape.email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });
export type ResetValues = z.infer<typeof resetSchema>;

export const profileSchema = z.object({
  fullName: registerSchema.shape.fullName,
  displayName: registerSchema.shape.displayName,
  phone: optionalPhone,
  campusArea: registerSchema.shape.campusArea,
});
export type ProfileValues = z.infer<typeof profileSchema>;

/** Only same-site relative paths are accepted as post-login destinations (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) return fallback;
  return next;
}

/** Sends a visitor to sign-in and brings them back to the exact page afterwards. */
export function loginHref(returnTo: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(returnTo))}`;
}

export const MESSAGE_MAX = 2000;
/** Mirrors the server: trims, rejects empty or over-long messages. Returns the cleaned text or an error. */
export function checkMessage(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.replace(/\r\n?/g, '\n').trim();
  if (!body) return { ok: false, error: 'Write a message first.' };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Messages can be up to ${MESSAGE_MAX.toLocaleString('en-NG')} characters.` };
  return { ok: true, body };
}

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'prohibited_item', label: 'Prohibited or illegal item' },
  { value: 'counterfeit', label: 'Counterfeit or fake' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'misleading', label: 'Misleading or inaccurate listing' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];
export const REPORT_DETAILS_MAX = 1000;
export function checkReport(reason: string, details: string): { ok: true; details: string | undefined } | { ok: false; error: string } {
  if (!REPORT_REASONS.some((r) => r.value === reason)) return { ok: false, error: 'Choose a reason for your report.' };
  const d = details.trim();
  if (d.length > REPORT_DETAILS_MAX) return { ok: false, error: `Keep the details under ${REPORT_DETAILS_MAX.toLocaleString('en-NG')} characters.` };
  if (reason === 'other' && d.length < 10) return { ok: false, error: 'Please tell us a little more about the problem.' };
  return { ok: true, details: d || undefined };
}
