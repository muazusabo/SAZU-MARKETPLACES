import { describe, expect, it } from 'vitest';
import { loginSchema, normalizeNigerianPhone, profileSchema, registerSchema, resetSchema, safeNextPath } from './validation';

const valid = {
  fullName: 'Amina Bello', displayName: 'Amina', email: ' Amina@Example.com ', password: 'correct-horse-battery',
  phone: '', campusArea: '', acceptTerms: true,
};

describe('registerSchema', () => {
  it('accepts valid input and normalises email', () => {
    const r = registerSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe('amina@example.com');
  });
  it('requires terms, a long password, and a valid phone when given', () => {
    expect(registerSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, phone: '08031234567' }).success).toBe(true);
  });
});

describe('other schemas', () => {
  it('login needs email and password', () => {
    expect(loginSchema.safeParse({ email: 'x', password: '' }).success).toBe(false);
  });
  it('reset requires matching passwords', () => {
    expect(resetSchema.safeParse({ password: 'a-long-password', confirm: 'different-pass' }).success).toBe(false);
    expect(resetSchema.safeParse({ password: 'a-long-password', confirm: 'a-long-password' }).success).toBe(true);
  });
  it('profile allows clearing the phone', () => {
    expect(profileSchema.safeParse({ fullName: 'Amina Bello', displayName: 'Amina', phone: '', campusArea: '' }).success).toBe(true);
  });
});

describe('normalizeNigerianPhone', () => {
  it('handles common formats', () => {
    expect(normalizeNigerianPhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalizeNigerianPhone('+1 202 555 0100')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths', () => expect(safeNextPath('/product/abc?x=1')).toBe('/product/abc?x=1'));
  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, '/a\nb'])(
    'rejects %s',
    (v) => expect(safeNextPath(v as string | null)).toBe('/'),
  );
});
