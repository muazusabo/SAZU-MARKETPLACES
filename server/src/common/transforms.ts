import { Transform } from 'class-transformer';
import { normalizeNigerianPhone } from './phone';

/** Trims strings; blank optional strings become undefined. */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));
export const TrimKeepEmpty = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export const LowerEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
/** Converts a valid Nigerian number to E.164; leaves invalid input untouched so validation rejects it. */
export const NormalizePhone = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    if (!v) return undefined;
    return normalizeNigerianPhone(v) ?? v;
  });

/** Query-string numbers: '' becomes undefined, anything else is parsed (NaN then fails @IsInt). */
export const OptionalNumber = () =>
  Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : Number(value)));
