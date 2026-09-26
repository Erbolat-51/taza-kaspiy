import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { OPEN_STATUSES } from '../domain/constants.js';
import { indexColor } from '../domain/cleanIndex.js';
import { reportInclude } from '../services/reportShape.js';
import { getZones } from '../services/zones.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
  includeDuplicates: z.enum(['true', 'false']).default('false'),
});

const DAY = 86_400_000;
/** Дни считаем по времени Актау (UTC+5), чтобы «сегодня» совпадало с реальностью акимата. */
const TZ_OFFSET = 5 * 3_600_000;
const dayKey = (d: Date) => new Date(d.getTime() + TZ_OFFSET).toISOString().slice(0, 10);

/** Автор без BigInt-полей (telegramId/chatId не сериализуются в JSON). */
const authorSelect = { select: { id: true, username: true, firstName: true, lang: true } };

/**
 * Админские эндпоинты (JWT): полные данные репорта — с сырым ответом ИИ и автором,
 * агрегаты для дашборда. Публичные эндпоинты эти поля скрывают.
 */
export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/admin/reports', async (req) => {
    const q = ListQuery.parse(req.query);
    const since = new Date(Date.now() - q.days * DAY);
    const items = await prisma.report.findMany({
      where: {
        // Открытые показываем всегда, закрытые — за период
        OR: [{ status: { in: OPEN_STATUSES } }, { createdAt: { gte: since } }],
        ...(q.includeDuplicates === 'false' && { parentId: null }),
      },
      include: { ...reportInclude, tgUser: authorSelect },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return { items };
  });

  app.get('/api/admin/reports/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const r = await prisma.report.findUniqueOrThrow({
      where: { id },
      include: {
        ...reportInclude,
        tgUser: authorSelect,
        events: { orderBy: { createdAt: 'asc' } },
        duplicates: {
          select: { id: true, code: true, photoThumb: true, createdAt: true, comment: true },
        },
        parent: { select: { id: true, code: true } },
      },
    });
    return r;
  });

  app.get('/api/admin/dashboard', async () => {
    const now = new Date();
    const todayStart = new Date(Date.parse(dayKey(now)) - TZ_OFFSET);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const monthAgo = new Date(now.getTime() - 30 * DAY);

    const [newToday, inWork, resolvedWeek, resolvedMonth, recent, openReports, zones] =
      await Promise.all([
        prisma.report.count({ where: { parentId: null, createdAt: { gte: todayStart } } }),
        prisma.report.count({
          where: { parentId: null, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        }),
        prisma.report.count({
          where: { parentId: null, status: 'RESOLVED', resolvedAt: { gte: weekAgo } },
        }),
        prisma.report.findMany({
          where: { parentId: null, status: 'RESOLVED', resolvedAt: { gte: monthAgo } },
          select: { createdAt: true, resolvedAt: true },
        }),
        prisma.report.findMany({
          where: {
            parentId: null,
            OR: [{ createdAt: { gte: monthAgo } }, { resolvedAt: { gte: monthAgo } }],
          },
          select: { createdAt: true, resolvedAt: true, category: true },
        }),
        prisma.report.findMany({
          where: { parentId: null, status: { in: OPEN_STATUSES } },
          select: { lat: true, lng: true, severity: true, zoneId: true, category: true },
        }),
        getZones(),
      ]);

    const avgResolveHours = resolvedMonth.length
      ? resolvedMonth.reduce((s, r) => s + (r.resolvedAt!.getTime() - r.createdAt.getTime()), 0) /
        resolvedMonth.length /
        3_600_000
      : null;

    // Линия по дням за 30 дней: поступило / убрано
    const days = Array.from({ length: 30 }, (_, i) =>
      dayKey(new Date(now.getTime() - (29 - i) * DAY)),
    );
    const created = new Map(days.map((d) => [d, 0]));
    const resolved = new Map(days.map((d) => [d, 0]));
    const byCategory: Record<string, number> = {};
    for (const r of recent) {
      const c = dayKey(r.createdAt);
      if (created.has(c)) {
        created.set(c, created.get(c)! + 1);
        byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      }
      if (r.resolvedAt) {
        const d = dayKey(r.resolvedAt);
        if (resolved.has(d)) resolved.set(d, resolved.get(d)! + 1);
      }
    }

    const openByZone = new Map<number, number>();
    for (const r of openReports) {
      if (r.zoneId) openByZone.set(r.zoneId, (openByZone.get(r.zoneId) ?? 0) + 1);
    }
    const zoneStats = zones.map((z) => ({
      id: z.id,
      nameKk: z.nameKk,
      nameRu: z.nameRu,
      kind: z.kind,
      cleanIndex: z.cleanIndex,
      color: indexColor(z.cleanIndex),
      open: openByZone.get(z.id) ?? 0,
    }));
    const avgIndex = zones.length
      ? Math.round((zones.reduce((s, z) => s + z.cleanIndex, 0) / zones.length) * 10) / 10
      : 100;

    return {
      kpi: {
        newToday,
        inWork,
        resolvedWeek,
        avgResolveHours: avgResolveHours === null ? null : Math.round(avgResolveHours * 10) / 10,
        avgIndex,
      },
      daily: days.map((d) => ({ day: d, created: created.get(d)!, resolved: resolved.get(d)! })),
      byCategory,
      zones: zoneStats,
      topProblemZones: [...zoneStats]
        .filter((z) => z.open > 0)
        .sort((a, b) => a.cleanIndex - b.cleanIndex)
        .slice(0, 5),
      heat: openReports.map((r) => [r.lat, r.lng, r.severity] as const),
    };
  });
}
