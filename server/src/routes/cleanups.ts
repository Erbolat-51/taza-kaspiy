import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';

const CreateBody = z.object({
  zoneId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(120),
  startsAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now() - 3_600_000, 'must be in future'),
  meetingPoint: z.string().trim().min(2).max(200),
  maxVolunteers: z.coerce.number().int().min(1).max(1000).default(50),
});
const StatusBody = z.object({ status: z.enum(['PLANNED', 'DONE', 'CANCELLED']) });
const IdParams = z.object({ id: z.coerce.number().int().positive() });

const zoneSelect = { select: { id: true, nameKk: true, nameRu: true } };

export default async function cleanupRoutes(app: FastifyInstance) {
  // Публично: ближайшие субботники (для сайта)
  app.get('/api/cleanups', async () =>
    prisma.cleanup.findMany({
      where: { status: 'PLANNED', startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 20,
      include: { zone: zoneSelect, _count: { select: { signups: true } } },
    }),
  );

  // Админка: все субботники со списком записавшихся
  app.get('/api/admin/cleanups', { preHandler: app.authenticate }, async () =>
    prisma.cleanup.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: {
        zone: zoneSelect,
        signups: {
          orderBy: { createdAt: 'asc' },
          select: {
            createdAt: true,
            tgUser: { select: { id: true, firstName: true, username: true } },
          },
        },
      },
    }),
  );

  /** Создание → событие шины → бот рассылает приглашение всем подписчикам. */
  app.post('/api/admin/cleanups', { preHandler: app.authenticate }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const cleanup = await prisma.cleanup.create({ data: body, include: { zone: zoneSelect } });
    bus.emit('cleanup:created', { cleanupId: cleanup.id });
    return reply.code(201).send(cleanup);
  });

  app.patch('/api/admin/cleanups/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { status } = StatusBody.parse(req.body);
    const cleanup = await prisma.cleanup.update({ where: { id }, data: { status } });
    bus.emit('cleanup:updated', { cleanupId: id });
    return cleanup;
  });
}
