import { describe, expect, it } from 'vitest';
import { findDuplicateParent, type DupCandidate } from '../src/domain/duplicates.js';

const now = new Date('2026-07-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
// ~0.00045° широты ≈ 50 м
const base = { lat: 43.65, lng: 51.15 };

const cand = (over: Partial<DupCandidate>): DupCandidate => ({
  id: 1,
  lat: base.lat,
  lng: base.lng,
  category: 'PLASTIC',
  status: 'NEW',
  createdAt: hoursAgo(1),
  parentId: null,
  ...over,
});

describe('findDuplicateParent', () => {
  const report = { ...base, category: 'PLASTIC' as const };

  it('находит открытый репорт рядом той же категории', () => {
    const c = cand({ lat: base.lat + 0.0002 }); // ~22 м
    expect(findDuplicateParent(report, [c], now)?.id).toBe(1);
  });

  it('игнорирует дальше 50 м', () => {
    expect(findDuplicateParent(report, [cand({ lat: base.lat + 0.0006 })], now)).toBeNull(); // ~67 м
  });

  it('игнорирует другую категорию, закрытые, старше 48 ч и сами дубликаты', () => {
    const list = [
      cand({ id: 2, category: 'OIL' }),
      cand({ id: 3, status: 'RESOLVED' }),
      cand({ id: 4, status: 'REJECTED' }),
      cand({ id: 5, createdAt: hoursAgo(49) }),
      cand({ id: 6, parentId: 99 }),
    ];
    expect(findDuplicateParent(report, list, now)).toBeNull();
  });

  it('выбирает ближайший из нескольких', () => {
    const list = [
      cand({ id: 7, lat: base.lat + 0.0003 }),
      cand({ id: 8, lat: base.lat + 0.0001 }),
      cand({ id: 9, status: 'IN_PROGRESS', lat: base.lat + 0.0002 }),
    ];
    expect(findDuplicateParent(report, list, now)?.id).toBe(8);
  });
});
