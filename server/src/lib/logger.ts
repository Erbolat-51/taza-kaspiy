import pino from 'pino';

const env = process.env.NODE_ENV ?? 'development';

/** Единый pino-логгер: его же использует Fastify (loggerInstance), бот и сервисы. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env === 'test' ? 'warn' : 'info'),
  redact: ['req.headers.authorization'],
  ...(env === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
