import type { Category, ReportStatus } from '../types';

export const CATEGORIES: Category[] = [
  'PLASTIC',
  'TRASH',
  'OIL',
  'DEAD_ANIMAL',
  'SEWAGE',
  'CONSTRUCTION',
  'OTHER',
];

export const CATEGORY_EMOJI: Record<Category, string> = {
  TRASH: '🗑',
  PLASTIC: '🧴',
  OIL: '🛢',
  DEAD_ANIMAL: '🦭',
  SEWAGE: '🚱',
  CONSTRUCTION: '🧱',
  OTHER: '❔',
};

/** Группы статусов для публичной карты: новый / в работе / убрано. */
export type StatusGroup = 'new' | 'work' | 'done' | 'rejected';

export const statusGroup = (s: ReportStatus): StatusGroup =>
  s === 'NEW' || s === 'CONFIRMED'
    ? 'new'
    : s === 'ASSIGNED' || s === 'IN_PROGRESS'
      ? 'work'
      : s === 'RESOLVED'
        ? 'done'
        : 'rejected';

export const GROUP_COLOR: Record<StatusGroup, string> = {
  new: '#C8553D',
  work: '#E0A43A',
  done: '#2E8B57',
  rejected: '#8A96A3',
};

export const ZONE_COLOR = { green: '#2E8B57', yellow: '#E0A43A', red: '#C8553D' } as const;

export const indexColor = (i: number) =>
  i >= 80 ? ZONE_COLOR.green : i >= 50 ? ZONE_COLOR.yellow : ZONE_COLOR.red;
