import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export default async function executorRoutes(app: FastifyInstance) {
  app.get('/api/executors', { preHandler: app.authenticate }, async () => {
    const rows = await prisma.executor.findMany({
      orderBy: { id: 'asc' },
      include: {
        tgUser: { select: { username: true, firstName: true } },
        _count: { select: { reports: { where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } } } },
      },
    });
    return rows.map(({ _count, ...e }) => ({
      ...e,
      linked: e.tgUserId !== null,
      activeTasks: _count.reports,
    }));
  });
}
