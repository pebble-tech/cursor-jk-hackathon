import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AI_GATEWAY_API_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  QR_SECRET_KEY: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().default('Cursor Hackathon Kashmir <noreply@cursorhackathon.pebbletech.my>'),
});

export const env = EnvSchema.parse(process.env);
