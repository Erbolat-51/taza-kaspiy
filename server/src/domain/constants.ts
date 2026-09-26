import type { Category, ReportStatus } from '@prisma/client';

export const CATEGORIES = [
  'TRASH',
  'PLASTIC',
  'OIL',
  'DEAD_ANIMAL',
  'SEWAGE',
  'CONSTRUCTION',
  'OTHER',
] as const satisfies readonly Category[];

export const STATUSES = [
  'NEW',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
] as const satisfies readonly ReportStatus[];

export const OPEN_STATUSES: ReportStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'];

export const isOpen = (s: ReportStatus) => OPEN_STATUSES.includes(s);
