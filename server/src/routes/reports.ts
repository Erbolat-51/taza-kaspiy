import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CATEGORIES, STATUSES } from '../domain/constants.js';
import { readMultipart, requireFile } from '../lib/multipart.js';
import { adminActor } from '../plugins/auth.js';
import {
  addAfterPhoto,
  assignExecutor,
  changeStatus,
  createReport,
  getReportDetails,
  listReports,
} from '../services/reports.js';
import { toPublic, toPublicDetails } from '../services/reportShape.js';

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));

const ListQuery = z.object({
  status: csv(STATUSES).optional(),
  category: csv(CATEGORIES).optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeDuplicates: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

const IdParams = z.object({ id: z.coerce.number().int().positive() });

const CreateFields = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  comment: z.string().trim().max(1000).optional(),
});

const StatusBody = z.object({
  status: z.enum(STATUSES),
  reason: z.string().trim().min(1).max(500).optional(),
});

const AssignBody = z.object({ executorId: z.coerce.number().int().positive() });

export default async function reportRoutes(app: FastifyInstance) {
  // Публичные
  app.get('/api/reports', async (req) => {
    const q = ListQuery.parse(req.query);
    const from = q.from ?? (q.days ? new Date(Date.now() - q.days * 86_400_000) : undefined);
    const { items, total } = await listReports({
      status: q.status,
      category: q.category,
      zoneId: q.zoneId,
      from,
      to: q.to,
      includeDuplicates: q.includeDuplicates === 'true',
      limit: q.limit,
      offset: q.offset,
    });
    return { total, items: items.map(toPublic) };
  });

  app.get('/api/reports/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return toPublicDetails(await getReportDetails(id));
  });

  app.post(
    '/api/reports',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const mp = await readMultipart(req);
      const file = requireFile(mp);
      const fields = CreateFields.parse(mp.fields);
      const res = await createReport({
        source: 'WEB',
        lat: fields.lat,
        lng: fields.lng,
        comment: fields.comment,
        image: file.buffer,
        actor: 'web',
      });
      return reply.code(201).send({
        report: toPublic(res.report),
        duplicateOf: res.duplicateOf,
        aiProvider: res.classification.provider,
      });
    },
  );

  // Админские
  app.patch('/api/reports/:id/status', { preHandler: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = StatusBody.parse(req.body);
    return toPublic(await changeStatus(id, body.status, adminActor(req), { reason: body.reason }));
  });

  app.post('/api/reports/:id/assign', { preHandler: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { executorId } = AssignBody.parse(req.body);
    return toPublic(await assignExecutor(id, executorId, adminActor(req)));
  });

  app.post('/api/reports/:id/after-photo', { preHandler: app.authenticate }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const file = requireFile(await readMultipart(req));
    return toPublic(await addAfterPhoto(id, file.buffer, adminActor(req)));
  });
}
