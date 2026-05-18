import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  TRENGO_BASE_URL: z.string().url().default('https://app.trengo.com/api/v2'),
  TRENGO_TOKEN: z.string().optional(),
  TRENGO_WEBHOOK_SECRET: z.string().optional(),
  WA_MARKETING_QUIET_HOUR_START: z.coerce.number().int().min(0).max(23).default(22),
  WA_MARKETING_QUIET_HOUR_END: z.coerce.number().int().min(0).max(23).default(8),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!_config) {
    const parsed = ConfigSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
      throw new Error('Invalid environment configuration');
    }
    _config = parsed.data;
  }
  return _config;
}
