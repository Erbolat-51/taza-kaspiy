/**
 * Индекс чистоты зоны 0–100: 100 − Σ(вес_severity × затухание_по_возрасту)
 * по открытым корневым репортам зоны (дубликаты не считаются — их вес уже в severity родителя).
 */

export const SEVERITY_WEIGHT: Record<number, number> = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 35 };

const DAY = 24 * 60 * 60 * 1000;

/** 1.0 первые 7 дней, затем линейно до 0.5 к 30-му дню, дальше 0.5. */
export function ageDecay(createdAt: Date, now: Date): number {
  const days = (now.getTime() - createdAt.getTime()) / DAY;
  if (days <= 7) return 1;
  if (days >= 30) return 0.5;
  return 1 - 0.5 * ((days - 7) / 23);
}

export interface IndexInput {
  severity: number;
  createdAt: Date;
}

export function computeCleanIndex(openReports: IndexInput[], now = new Date()): number {
  const penalty = openReports.reduce(
    (sum, r) => sum + (SEVERITY_WEIGHT[r.severity] ?? 0) * ageDecay(r.createdAt, now),
    0,
  );
  const value = Math.max(0, Math.min(100, 100 - penalty));
  return Math.round(value * 10) / 10;
}

export type IndexColor = 'green' | 'yellow' | 'red';

export function indexColor(index: number): IndexColor {
  if (index >= 80) return 'green';
  if (index >= 50) return 'yellow';
  return 'red';
}
