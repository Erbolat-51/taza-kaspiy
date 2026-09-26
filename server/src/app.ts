import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'node:fs/promises';
import { ZodError } from 'zod';
import type { Env } from './env.js';
import { AppError } from './lib/errors.js';
import { MAX_FILE_BYTES } from './lib/multipart.js';
import authPlugin from './plugins/auth.js';
import { configureUploads } from './services/photos.js';
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import zoneRoutes from './routes/zones.js';
import executorRoutes from './routes/executors.js';
import statsRoutes from './routes/stats.js';

export const corsOrigins = (env: Env) => [env.PUBLIC_URL, 'http://localhost:5173'];

export async function buildApp(env: Env) {
  const app = Fastify({
    trustProxy: env.NODE_ENV === 'production', // за Caddy — реальный IP для rate limit
    logger: {
      level: env.NODE_ENV === 'test' ? 'warn' : 'info',
      redact: ['req.headers.authorization'],
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
    },
  });

  await app.register(cors, { origin: corsOrigins(env) });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  await app.register(authPlugin, { secret: env.JWT_SECRET });

  const uploadsRoot = configureUploads(env.UPLOADS_DIR);
  await mkdir(uploadsRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '7d',
    immutable: true,
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const status = 'statusCode' in err && err.statusCode ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.code(status).send({
      error: status >= 500 ? 'INTERNAL' : ('code' in err && err.code) || 'BAD_REQUEST',
      message: status >= 500 ? 'Внутренняя ошибка сервера' : err.message,
    });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(reportRoutes);
  await app.register(zoneRoutes);
  await app.register(executorRoutes);
  await app.register(statsRoutes);

  return app;
}
