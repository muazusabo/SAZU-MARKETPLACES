import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_ACCESS_SECRET: 'x'.repeat(40) };

  it('applies defaults and parses lists', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.DATABASE_SSL).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects non-PostgreSQL URLs', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/PostgreSQL/);
  });

  it('requires a strong JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires Cloudinary credentials when Cloudinary storage is enabled', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 'cloudinary' })).toThrow(/CLOUDINARY_CLOUD_NAME/);
    expect(() => validateEnv({
      ...base,
      STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'marketplace',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    })).not.toThrow();
  });

  it('requires S3 credentials when S3 is retained for legacy files', () => {
    expect(() => validateEnv({
      ...base,
      STORAGE_DRIVER: 'cloudinary',
      STORAGE_LEGACY_DRIVER: 's3',
      CLOUDINARY_CLOUD_NAME: 'marketplace',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    })).toThrow(/S3_REGION/);
  });

  it('requires SMTP credentials to be configured as a pair', () => {
    expect(() => validateEnv({ ...base, SMTP_USER: 'resend' })).toThrow(/SMTP_PASSWORD/);
    expect(() => validateEnv({ ...base, SMTP_PASSWORD: 'api-key' })).toThrow(/SMTP_USER/);
    expect(() =>
      validateEnv({ ...base, SMTP_HOST: 'smtp.resend.com', SMTP_USER: 'resend', SMTP_PASSWORD: 'api-key' }),
    ).not.toThrow();
  });

  it('refuses example secrets and missing SMTP in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-min-32-chars' }),
    ).toThrow(/SMTP_HOST[\s\S]*JWT_ACCESS_SECRET|JWT_ACCESS_SECRET[\s\S]*SMTP_HOST/);
  });
});
