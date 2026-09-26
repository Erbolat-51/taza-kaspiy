import type { Prisma } from '@prisma/client';

export const reportInclude = {
  zone: { select: { id: true, slug: true, nameKk: true, nameRu: true, kind: true } },
  executor: { select: { id: true, nameKk: true, nameRu: true, kind: true } },
} satisfies Prisma.ReportInclude;

export type ReportWithRefs = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

/** Публичное представление: без сырого ответа ИИ и без ссылки на автора. */
export function toPublic<T extends { aiRaw: unknown; tgUserId: number | null }>(r: T) {
  const { aiRaw, tgUserId, ...rest } = r;
  return rest;
}

export const formatCode = (id: number) => `ТК-${String(id).padStart(4, '0')}`;
