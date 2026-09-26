import type { Category, ReportStatus } from '@prisma/client';
import { haversine } from '../geo/geo.js';
import { isOpen } from './constants.js';

export const DUPLICATE_RADIUS_M = 50;
export const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface DupCandidate {
  id: number;
  lat: number;
  lng: number;
  category: Category;
  status: ReportStatus;
  createdAt: Date;
  parentId: number | null;
}

/**
 * Родитель для нового репорта: открытый корневой репорт той же категории
 * в радиусе 50 м за последние 48 ч. Если таких несколько — ближайший.
 */
export function findDuplicateParent<T extends DupCandidate>(
  report: { lat: number; lng: number; category: Category },
  candidates: T[],
  now = new Date(),
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c.parentId !== null || c.category !== report.category || !isOpen(c.status)) continue;
    if (now.getTime() - c.createdAt.getTime() > DUPLICATE_WINDOW_MS) continue;
    const d = haversine(report.lat, report.lng, c.lat, c.lng);
    if (d <= DUPLICATE_RADIUS_M && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Грубый bbox для SQL-предфильтра (~110 м в каждую сторону — с запасом к 50 м). */
export function duplicateBBox(lat: number, lng: number) {
  const dLat = 0.001;
  const dLng = 0.001 / Math.cos((lat * Math.PI) / 180);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
