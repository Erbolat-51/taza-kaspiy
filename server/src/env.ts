import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  /** 127.0.0.1 — доступ только через туннель/прокси; 0.0.0.0 — из локальной сети (dev, Docker) */
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('claude-sonnet-5'),
  AI_PROVIDER: z.enum(['auto', 'claude', 'clip', 'mock']).default('auto'),
  MODELS_DIR: z.string().default('./models'),
  JWT_SECRET: z.string().min(8),
  ADMIN_EMAIL: z.string().email().default('admin@taza.kz'),
  ADMIN_PASSWORD: z.string().min(6).default('admin123'),
  UPLOADS_DIR: z.string().default('./uploads'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Выводим только имена переменных — значения (токены) никогда не логируем
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${names}`);
  }
  return parsed.data;
}
