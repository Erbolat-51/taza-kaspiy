import { randomUUID } from 'node:crypto';
import type { Category, Prisma, ReportSource, ReportStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';
import { AppError, notFound } from '../lib/errors.js';
import { classifyPhoto } from '../ai/classify.js';
import { DEFAULT_SEVERITY } from '../ai/mock.js';
import type { ClassifyResult } from '../ai/types.js';
import { OPEN_STATUSES, isOpen } from '../domain/constants.js';
import { DUPLICATE_WINDOW_MS, duplicateBBox, findDuplicateParent } from '../domain/duplicates.js';
import { processPhoto, storePhoto } from './photos.js';
import { lookupZone, recalcZoneIndex } from './zones.js';
import { formatCode, reportInclude, type ReportWithRefs } from './reportShape.js';

const TX_OPTS = { timeout: 15_000, maxWait: 10_000 };

const loadReport = async (id: number): Promise<ReportWithRefs> => {
  const r = await prisma.report.findUnique({ where: { id }, include: reportInclude });
  if (!r) throw notFound();
  return r;
};

// ───────────────────────────── создание ─────────────────────────────

export interface CreateReportInput {
  source: ReportSource;
  lat: number;
  lng: number;
  comment?: string | null;
  image: Buffer;
  tgUserId?: number | null;
  actor: string;
  /** Если классификация уже сделана (бот показывает результат до сохранения) */
  classification?: ClassifyResult;
  isDemo?: boolean;
  createdAt?: Date;
}

export interface CreateReportResult {
  report: ReportWithRefs;
  classification: ClassifyResult;
  duplicateOf: { id: number; code: string } | null;
}

/**
 * Пайплайн приёма: фото (sharp) → ИИ → зона → дубликаты → запись + история → индекс → событие.
 * Фото уменьшаем до классификации: ИИ получает ≤1600px, а мусорные снимки не пишем на диск.
 */
export async function createReport(input: CreateReportInput): Promise<CreateReportResult> {
  const processed = await processPhoto(input.image);
  const ai =
    input.classification ??
    (await classifyPhoto({ image: processed.full, comment: input.comment }));
  if (!ai.isPollution) {
    // Чистый пляж / селфи / скриншот: репорт не создаём, фото на диск не пишем
    throw new AppError(422, 'NOT_POLLUTION', 'На фото не обнаружено загрязнения', {
      summaryKk: ai.summaryKk,
      summaryRu: ai.summaryRu,
      aiProvider: ai.provider,
    });
  }

  const [files, zone] = await Promise.all([
    storePhoto(processed),
    lookupZone(input.lat, input.lng),
  ]);

  const now = input.createdAt ?? new Date();
  const bbox = duplicateBBox(input.lat, input.lng);
  const candidates = await prisma.report.findMany({
    where: {
      parentId: null,
      category: ai.category,
      status: { in: OPEN_STATUSES },
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS), lte: now },
      lat: { gte: bbox.minLat, lte: bbox.maxLat },
      lng: { gte: bbox.minLng, lte: bbox.maxLng },
    },
    select: {
      id: true,
      code: true,
      lat: true,
      lng: true,
      category: true,
      status: true,
      createdAt: true,
      parentId: true,
      severity: true,
    },
  });
  const parent = findDuplicateParent(
    { lat: input.lat, lng: input.lng, category: ai.category },
    candidates,
    now,
  );

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        code: `tmp-${randomUUID()}`,
        source: input.source,
        tgUserId: input.tgUserId ?? null,
        lat: input.lat,
        lng: input.lng,
        zoneId: zone?.id ?? null,
        comment: input.comment || null,
        photo: files.photo,
        photoThumb: files.thumb,
        category: ai.category,
        severity: ai.severity,
        aiConfidence: ai.confidence,
        aiSummaryKk: ai.summaryKk,
        aiSummaryRu: ai.summaryRu,
        aiRaw: { provider: ai.provider, raw: ai.raw } as Prisma.InputJsonValue,
        parentId: parent?.id ?? null,
        isDemo: input.isDemo ?? false,
        createdAt: now,
      },
    });
    await tx.reportEvent.createMany({
      data: [
        {
          reportId: created.id,
          type: 'CREATED',
          actor: input.actor,
          createdAt: now,
          payload: {
            source: input.source,
            zoneId: zone?.id ?? null,
            duplicateOf: parent?.id ?? null,
          },
        },
        {
          reportId: created.id,
          type: 'AI_CLASSIFIED',
          actor: 'system',
          createdAt: now,
          payload: {
            provider: ai.provider,
            category: ai.category,
            severity: ai.severity,
            confidence: ai.confidence,
          },
        },
      ],
    });
    if (parent) {
      await tx.report.update({
        where: { id: parent.id },
        data: {
          duplicatesCount: { increment: 1 },
          severity: Math.max(parent.severity, ai.severity),
        },
      });
    }
    return tx.report.update({
      where: { id: created.id },
      data: { code: formatCode(created.id) },
      include: reportInclude,
    });
  }, TX_OPTS);

  if (zone) await recalcZoneIndex(zone.id);

  bus.emit('report:created', { report, duplicateOf: parent?.id ?? null });
  if (parent) {
    bus.emit('report:updated', {
      report: await loadReport(parent.id),
      change: { type: 'duplicate', childId: report.id },
      actor: 'system',
    });
  }

  return {
    report,
    classification: ai,
    duplicateOf: parent ? { id: parent.id, code: parent.code } : null,
  };
}

// ───────────────────────────── чтение ─────────────────────────────

export interface ListFilters {
  status?: ReportStatus[];
  category?: Category[];
  zoneId?: number;
  from?: Date;
  to?: Date;
  includeDuplicates?: boolean;
  limit: number;
  offset: number;
}

export async function listReports(f: ListFilters) {
  const where: Prisma.ReportWhereInput = {
    ...(f.status && { status: { in: f.status } }),
    ...(f.category && { category: { in: f.category } }),
    ...(f.zoneId !== undefined && { zoneId: f.zoneId }),
    ...((f.from || f.to) && { createdAt: { gte: f.from, lte: f.to } }),
    ...(!f.includeDuplicates && { parentId: null }),
  };
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: f.limit,
      skip: f.offset,
    }),
    prisma.report.count({ where }),
  ]);
  return { items, total };
}

export async function getReportDetails(id: number) {
  const r = await prisma.report.findUnique({
    where: { id },
    include: {
      ...reportInclude,
      events: { orderBy: { createdAt: 'asc' } },
      duplicates: { select: { id: true, code: true, photoThumb: true, createdAt: true } },
      parent: { select: { id: true, code: true } },
    },
  });
  if (!r) throw notFound();
  return r;
}

// ───────────────────────────── изменения ─────────────────────────────

export interface StatusOptions {
  reason?: string;
}

/**
 * Смена статуса + запись в историю + событие. При закрытии корневого репорта
 * (RESOLVED/REJECTED) дубликаты закрываются вместе с ним — их авторы тоже получат уведомление.
 */
export async function changeStatus(
  id: number,
  to: ReportStatus,
  actor: string,
  opts: StatusOptions = {},
): Promise<ReportWithRefs> {
  const current = await prisma.report.findUnique({ where: { id } });
  if (!current) throw notFound();
  if (current.status === to) return loadReport(id);
  if (to === 'ASSIGNED' && !current.executorId) {
    throw new AppError(400, 'NO_EXECUTOR', 'Сначала назначьте исполнителя');
  }
  if (to === 'REJECTED' && !opts.reason) {
    throw new AppError(400, 'REASON_REQUIRED', 'Укажите причину отклонения');
  }

  const now = new Date();
  const data: Prisma.ReportUpdateInput = { status: to };
  if (to === 'RESOLVED') data.resolvedAt = now;
  else if (current.resolvedAt) data.resolvedAt = null; // переоткрытие
  if (to === 'REJECTED') data.rejectReason = opts.reason;

  const [report] = await prisma.$transaction([
    prisma.report.update({ where: { id }, data, include: reportInclude }),
    prisma.reportEvent.create({
      data: {
        reportId: id,
        type: 'STATUS_CHANGED',
        actor,
        payload: { from: current.status, to, ...(opts.reason && { reason: opts.reason }) },
      },
    }),
  ]);

  if (report.zoneId) await recalcZoneIndex(report.zoneId);
  bus.emit('report:updated', {
    report,
    change: { type: 'status', from: current.status, to },
    actor,
  });

  if ((to === 'RESOLVED' || to === 'REJECTED') && current.parentId === null) {
    const children = await prisma.report.findMany({
      where: { parentId: id, status: { in: OPEN_STATUSES } },
      select: { id: true },
    });
    for (const c of children) {
      await changeStatus(c.id, to, 'system', {
        reason: opts.reason ?? `Закрыт вместе с ${report.code}`,
      });
    }
  }
  return report;
}

export async function assignExecutor(
  id: number,
  executorId: number,
  actor: string,
): Promise<ReportWithRefs> {
  const [current, executor] = await Promise.all([
    prisma.report.findUnique({ where: { id } }),
    prisma.executor.findUnique({ where: { id: executorId } }),
  ]);
  if (!current) throw notFound();
  if (!executor) throw notFound('Executor');
  if (!isOpen(current.status)) {
    throw new AppError(409, 'REPORT_CLOSED', 'Репорт уже закрыт');
  }

  const [report] = await prisma.$transaction([
    prisma.report.update({
      where: { id },
      data: { executorId, assignedAt: new Date(), status: 'ASSIGNED' },
      include: reportInclude,
    }),
    prisma.reportEvent.create({
      data: {
        reportId: id,
        type: 'ASSIGNED',
        actor,
        payload: { executorId, executorNameKk: executor.nameKk, executorNameRu: executor.nameRu },
      },
    }),
    ...(current.status !== 'ASSIGNED'
      ? [
          prisma.reportEvent.create({
            data: {
              reportId: id,
              type: 'STATUS_CHANGED',
              actor,
              payload: { from: current.status, to: 'ASSIGNED' },
            },
          }),
        ]
      : []),
  ]);

  bus.emit('report:updated', { report, change: { type: 'assigned', executorId }, actor });
  if (current.status !== 'ASSIGNED') {
    bus.emit('report:updated', {
      report,
      change: { type: 'status', from: current.status, to: 'ASSIGNED' },
      actor,
    });
  }
  return report;
}

/** Фото «после» → RESOLVED. Используется админкой и исполнителем в боте. */
export async function addAfterPhoto(
  id: number,
  image: Buffer,
  actor: string,
): Promise<ReportWithRefs> {
  const current = await prisma.report.findUnique({ where: { id } });
  if (!current) throw notFound();
  if (current.status === 'REJECTED') {
    throw new AppError(409, 'REPORT_REJECTED', 'Репорт отклонён');
  }
  const files = await storePhoto(await processPhoto(image));

  const [report] = await prisma.$transaction([
    prisma.report.update({
      where: { id },
      data: { afterPhoto: files.photo },
      include: reportInclude,
    }),
    prisma.reportEvent.create({
      data: { reportId: id, type: 'AFTER_PHOTO', actor, payload: { photo: files.photo } },
    }),
  ]);
  bus.emit('report:updated', { report, change: { type: 'afterPhoto' }, actor });

  return current.status === 'RESOLVED' ? report : changeStatus(id, 'RESOLVED', actor);
}

/**
 * Житель подтвердил категорию (category = null) или выбрал другую.
 * Если ИИ не работал (mock), severity берём по умолчанию для выбранной категории.
 */
export async function setCategoryByUser(
  id: number,
  tgUserId: number,
  category: Category | null,
): Promise<ReportWithRefs> {
  const current = await prisma.report.findUnique({ where: { id } });
  if (!current || current.tgUserId !== tgUserId) throw notFound();
  const to = category ?? current.category;
  const wasMock = (current.aiRaw as { provider?: string } | null)?.provider === 'mock';
  const severity = category && wasMock ? DEFAULT_SEVERITY[to] : current.severity;

  const [report] = await prisma.$transaction([
    prisma.report.update({
      where: { id },
      data: { category: to, severity, categoryConfirmedByUser: true },
      include: reportInclude,
    }),
    prisma.reportEvent.create({
      data: {
        reportId: id,
        type: 'COMMENT',
        actor: `tg:${tgUserId}`,
        payload: { kind: 'category', from: current.category, to, confirmed: category === null },
      },
    }),
  ]);

  if (to !== current.category) {
    if (report.zoneId && severity !== current.severity) await recalcZoneIndex(report.zoneId);
    bus.emit('report:updated', {
      report,
      change: { type: 'category', from: current.category, to },
      actor: `tg:${tgUserId}`,
    });
  }
  return report;
}
