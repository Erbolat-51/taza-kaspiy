import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { OPEN_STATUSES } from '../domain/constants.js';
import { getZones } from '../services/zones.js';

export default async function statsRoutes(app: FastifyInstance) {
  /** Сводка для боковой панели публичной карты. */
  app.get('/api/stats/summary', async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [open, resolved7d, zones] = await Promise.all([
      prisma.report.count({ where: { parentId: null, status: { in: OPEN_STATUSES } } }),
      prisma.report.count({
        where: { parentId: null, status: 'RESOLVED', resolvedAt: { gte: weekAgo } },
      }),
      getZones(),
    ]);
    const avgIndex = zones.length
      ? Math.round((zones.reduce((s, z) => s + z.cleanIndex, 0) / zones.length) * 10) / 10
      : 100;
    return { open, resolved7d, avgIndex };
  });
}
