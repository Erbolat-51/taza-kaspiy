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
    const [zones, openCounts] = await Promise.all([
      getZones(),
      prisma.report.groupBy({
        by: ['zoneId'],
        where: { parentId: null, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
    ]);
    const openBy = new Map(openCounts.map((c) => [c.zoneId, c._count._all]));
    return zones.map((z) => ({
      ...z,
      color: indexColor(z.cleanIndex),
      openCount: openBy.get(z.id) ?? 0,
    }));
  });

  app.get('/api/zones/lookup', async (req) => {
    const { lat, lng } = LookupQuery.parse(req.query);
    const z = await lookupZone(lat, lng);
    return z ? { id: z.id, slug: z.slug, nameKk: z.nameKk, nameRu: z.nameRu } : null;
  });
}
