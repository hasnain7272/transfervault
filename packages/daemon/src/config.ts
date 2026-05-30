import { z } from 'zod';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),

  // Daemon security
  DAEMON_SECRET: z.string().min(32, 'DAEMON_SECRET must be at least 32 characters'),

  // Storage
  DATA_DIR: z.string().default('./data'),

  // Upload config
  CHUNK_SIZE_MB: z.coerce.number().default(64),
  MAX_FILE_SIZE_GB: z.coerce.number().default(500),
  MAX_CONCURRENT_UPLOADS: z.coerce.number().default(10),
  MAX_CONCURRENT_DOWNLOADS: z.coerce.number().default(50),

  // Cleanup
  CLEANUP_INTERVAL_MS: z.coerce.number().default(300_000), // 5 minutes

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  PAIR_CODE_RATE_LIMIT: z.coerce.number().default(5),

  // Heartbeat
  HEARTBEAT_INTERVAL_MS: z.coerce.number().default(30_000), // 30 seconds

  // Public endpoint URL (e.g. from localtunnel or cloudflared)
  PUBLIC_URL: z.string().url().default('http://localhost:3001'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    console.error('❌ Invalid configuration:');
    console.error(JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  return result.data;
}
