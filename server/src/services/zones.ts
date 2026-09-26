import type { Zone } from '@prisma/client';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';
import { findZone, type PolygonGeometry } from '../geo/geo.js';
import { computeCleanIndex } from '../domain/cleanIndex.js';
import { OPEN_STATUSES } from '../domain/constants.js';

export type CachedZone = Omit<Zone, 'polygon'> & { polygon: PolygonGeometry };

/**
 * Зоны держим в памяти, чтобы lookup был мгновенным. Кэш живёт 30 с: скрипты вне сервера
 * (seed, db:clean) меняют индексы в БД, и запущенный сервер подхватывает их без перезапуска.
 */
const CACHE_TTL_MS = 30_000;
let cache: CachedZone[] | null = null;
let loadedAt = 0;

export async function getZones(): Promise<CachedZone[]> {
  if (!cache || Date.now() - loadedAt > CACHE_TTL_MS) {
    const rows = await prisma.zone.findMany({ orderBy: { id: 'asc' } });
    cache = rows.map((z) => ({ ...z, polygon: z.polygon as unknown as PolygonGeometry }));
    loadedAt = Date.now();
  }
  return cache;
}

export function invalidateZones() {
  cache = null;
}

export async function lookupZone(lat: number, lng: number): Promise<CachedZone | null> {
  return findZone(lat, lng, await getZones());
}

/** Пересчёт индекса чистоты зоны; кэш — поле Zone.cleanIndex. */
export async function recalcZoneIndex(zoneId: number): Promise<number> {
  const open = await prisma.report.findMany({
    where: { zoneId, parentId: null, status: { in: OPEN_STATUSES } },
    select: { severity: true, createdAt: true },
  });
  const cleanIndex = computeCleanIndex(open);
  const zones = await getZones();
  const cached = zones.find((z) => z.id === zoneId);
  if (cached && cached.cleanIndex === cleanIndex) return cleanIndex;

  const now = new Date();
  await prisma.zone.update({ where: { id: zoneId }, data: { cleanIndex, indexUpdatedAt: now } });
  if (cached) {
    cached.cleanIndex = cleanIndex;
    cached.indexUpdatedAt = now;
  }
  bus.emit('zone:index', { zoneId, cleanIndex });
  return cleanIndex;
}

/** Полный пересчёт — при старте и по таймеру (затухание по возрасту меняется со временем). */
export async function recalcAllZones() {
  for (const z of await getZones()) await recalcZoneIndex(z.id);
}
