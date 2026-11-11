import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the backend folder first, then the repository root.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATA_SEED: z.coerce.number().int().default(20261022),
  DATA_PROFILE: z.enum(['small', 'medium', 'full']).default('small'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default(''),
  LLM_BASE_URL: z.string().optional().default('https://api.openai.com/v1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
  // Fail fast: the application must never start with an unknown database.
  throw new Error(`Invalid environment configuration - ${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
