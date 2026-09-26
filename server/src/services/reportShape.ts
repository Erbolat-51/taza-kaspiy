import type { Prisma } from '@prisma/client';

export const reportInclude = {
  zone: { select: { id: true, slug: true, nameKk: true, nameRu: true, kind: true } },
  executor: { select: { id: true, nameKk: true, nameRu: true, kind: true } },
} satisfies Prisma.ReportInclude;

export type ReportWithRefs = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

/**
 * Публичное представление: без сырого ответа ИИ и без ссылки на автора.
 * Оставляем только имя провайдера — карта показывает, кто классифицировал фото.
 */
export function toPublic<T extends { aiRaw: unknown; tgUserId: number | null }>(r: T) {
  const { aiRaw, tgUserId, ...rest } = r;
  const aiProvider = (aiRaw as { provider?: string } | null)?.provider ?? null;
  return { ...rest, aiProvider };
}

/** Роль автора события без персональных данных: "admin:ivan@taza.kz" → "admin". */
export const publicActor = (actor: string) => {
  const role = actor.split(':')[0] ?? 'system';
  return role === 'tg' || role === 'bot' ? 'resident' : role;
};

export function toPublicDetails<
  T extends { aiRaw: unknown; tgUserId: number | null; events: { actor: string }[] },
>(r: T) {
  const pub = toPublic(r);
  return { ...pub, events: r.events.map((e) => ({ ...e, actor: publicActor(e.actor) })) };
}

export const formatCode = (id: number) => `ТК-${String(id).padStart(4, '0')}`;
