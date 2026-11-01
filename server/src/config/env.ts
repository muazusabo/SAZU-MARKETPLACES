import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  APP_WEB_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a PostgreSQL URL'),
  DATABASE_SSL: bool,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(300),
  // Shared secret the web app sends so its server-side page requests are not rate limited (see AppThrottlerGuard). Optional.
  INTERNAL_API_KEY: z.string().min(24, 'INTERNAL_API_KEY must be at least 24 characters when set').optional().or(z.literal('').transform(() => undefined)),
  // Number of reverse-proxy hops to trust for client IPs (0 = none). Needed for correct rate limiting behind a proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  // Used for pre-Cloudinary public files and private files after switching to Cloudinary.
  STORAGE_LEGACY_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET_PUBLIC: z.string().optional(),
  S3_BUCKET_PRIVATE: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  PUBLIC_FILES_BASE_URL: z.string().url().default('http://localhost:4000/files'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('SAZU Marketplace <no-reply@localhost>'),
})
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.SMTP_USER ? 'SMTP_PASSWORD' : 'SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASSWORD must be set together',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.SMTP_HOST) {
        ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required in production' });
      }
      if (env.JWT_ACCESS_SECRET.startsWith('change-me')) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Replace the example JWT secret' });
      }
    }
    if (env.STORAGE_DRIVER === 's3' || (env.STORAGE_DRIVER === 'cloudinary' && env.STORAGE_LEGACY_DRIVER === 's3')) {
      for (const k of ['S3_REGION', 'S3_BUCKET_PUBLIC', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when S3 storage is enabled` });
      }
    }
    if (env.STORAGE_DRIVER === 'cloudinary') {
      for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
        if (!env[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when STORAGE_DRIVER=cloudinary` });
      }
    }
    if (env.COOKIE_SAMESITE === 'none' && env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: "'none' requires HTTPS (production)" });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule. Fails fast with a readable message when configuration is wrong. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
