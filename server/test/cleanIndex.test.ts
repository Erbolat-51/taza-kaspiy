import { describe, expect, it } from 'vitest';
import { ageDecay, computeCleanIndex, indexColor } from '../src/domain/cleanIndex.js';

const now = new Date('2026-07-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('ageDecay', () => {
  it('1.0 первые 7 дней', () => {
    expect(ageDecay(daysAgo(0), now)).toBe(1);
    expect(ageDecay(daysAgo(7), now)).toBe(1);
  });
  it('линейно до 0.5 к 30-му дню', () => {
    expect(ageDecay(daysAgo(18.5), now)).toBeCloseTo(0.75, 5);
    expect(ageDecay(daysAgo(30), now)).toBe(0.5);
    expect(ageDecay(daysAgo(90), now)).toBe(0.5);
  });
});

describe('computeCleanIndex', () => {
  it('пустая зона — 100', () => {
    expect(computeCleanIndex([], now)).toBe(100);
  });
  it('вычитает веса severity', () => {
    const r = [
      { severity: 1, createdAt: daysAgo(1) }, // 4
      { severity: 3, createdAt: daysAgo(2) }, // 14
      { severity: 5, createdAt: daysAgo(3) }, // 35
    ];
    expect(computeCleanIndex(r, now)).toBe(47);
  });
  it('старые репорты весят вдвое меньше', () => {
    expect(computeCleanIndex([{ severity: 4, createdAt: daysAgo(40) }], now)).toBe(89); // 100 − 22·0.5
  });
  it('не уходит ниже 0', () => {
    const many = Array.from({ length: 10 }, () => ({ severity: 5, createdAt: daysAgo(1) }));
    expect(computeCleanIndex(many, now)).toBe(0);
  });
});

describe('indexColor', () => {
  it('пороги 80 / 50', () => {
    expect(indexColor(80)).toBe('green');
    expect(indexColor(79.9)).toBe('yellow');
    expect(indexColor(50)).toBe('yellow');
    expect(indexColor(49.9)).toBe('red');
  });
});
