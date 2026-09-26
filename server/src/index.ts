import { loadEnv } from './env.js';
import { buildApp, corsOrigins } from './app.js';
import { attachRealtime } from './realtime.js';
import { prisma } from './db.js';
import { bus } from './lib/bus.js';
import { recalcAllZones } from './services/zones.js';
import { startBot } from './bot/index.js';
import { warmupAi } from './ai/classify.js';
import { stopClip } from './ai/clip.js';

const env = loadEnv();
const app = await buildApp(env);
const io = attachRealtime(app.server, corsOrigins(env));

bus.onError((err) => app.log.error({ err }, 'bus listener failed'));

// БД может «просыпаться» (Neon) — не падаем, индекс пересчитается по таймеру
await recalcAllZones().catch((err) => app.log.error({ err }, 'initial zone recalc failed'));
// Затухание по возрасту меняет индекс со временем — пересчитываем раз в час
const timer = setInterval(
  () => {
    recalcAllZones().catch((err) => app.log.error({ err }, 'zone recalc failed'));
  },
  60 * 60 * 1000,
);

// Бот в том же процессе. Если Telegram недоступен — API и карта продолжают работать
const bot = await startBot(env, app).catch((err) => {
  app.log.error({ err }, 'bot: failed to start');
  return null;
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
// Локальная модель грузится в фоне: сервер уже принимает запросы
warmupAi();

const shutdown = async (signal: string) => {
  app.log.info(`${signal}: shutting down`);
  clearInterval(timer);
  await bot?.stop().catch(() => {});
  stopClip();
  io.disconnectSockets(true);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
