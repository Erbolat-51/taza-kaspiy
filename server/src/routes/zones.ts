import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { indexColor } from '../domain/cleanIndex.js';
import { OPEN_STATUSES } from '../domain/constants.js';
import { getZones, lookupZone } from '../services/zones.js';

const LookupQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export default async function zoneRoutes(app: FastifyInstance) {
  app.get('/api/zones', async () => {
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const [zones, openCounts, resolvedCounts, lastReports] = await Promise.all([
      getZones(),
      prisma.report.groupBy({
        by: ['zoneId'],
        where: { parentId: null, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      prisma.report.groupBy({
        by: ['zoneId'],
        where: { parentId: null, status: 'RESOLVED', resolvedAt: { gte: monthAgo } },
        _count: { _all: true },
      }),
      prisma.report.groupBy({ by: ['zoneId'], _max: { createdAt: true } }),
    ]);
    const openBy = new Map(openCounts.map((c) => [c.zoneId, c._count._all]));
    const resolvedBy = new Map(resolvedCounts.map((c) => [c.zoneId, c._count._all]));
    const lastBy = new Map(lastReports.map((c) => [c.zoneId, c._max.createdAt]));
    return zones.map((z) => ({
      ...z,
      color: indexColor(z.cleanIndex),
      openCount: openBy.get(z.id) ?? 0,
      resolved30d: resolvedBy.get(z.id) ?? 0,
      lastReportAt: lastBy.get(z.id) ?? null,
    }));
  });

  app.get('/api/zones/lookup', async (req) => {
    const { lat, lng } = LookupQuery.parse(req.query);
    const z = await lookupZone(lat, lng);
    return z ? { id: z.id, slug: z.slug, nameKk: z.nameKk, nameRu: z.nameRu } : null;
  });
}
