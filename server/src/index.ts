import { loadEnv } from './env.js';
import { buildApp, corsOrigins } from './app.js';
import { attachRealtime } from './realtime.js';
import { prisma } from './db.js';
import { bus } from './lib/bus.js';
import { recalcAllZones } from './services/zones.js';

const env = loadEnv();
const app = await buildApp(env);
const io = attachRealtime(app.server, corsOrigins(env));

bus.onError((err) => app.log.error({ err }, 'bus listener failed'));

await recalcAllZones();
// Затухание по возрасту меняет индекс со временем — пересчитываем раз в час
const timer = setInterval(
  () => {
    recalcAllZones().catch((err) => app.log.error({ err }, 'zone recalc failed'));
  },
  60 * 60 * 1000,
);

await app.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async (signal: string) => {
  app.log.info(`${signal}: shutting down`);
  clearInterval(timer);
  io.disconnectSockets(true);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
