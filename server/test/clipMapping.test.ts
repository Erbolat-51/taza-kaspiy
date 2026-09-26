import { describe, expect, it } from 'vitest';
import {
  CLASS_PROMPTS,
  PROMPT_LIST,
  groupScores,
  scoresToClassification,
  type ClassScore,
  type ClipClass,
} from '../src/ai/clipMapping.js';
import { ClassificationSchema } from '../src/ai/types.js';

/** Равномерно раскладывает скор класса по его промптам — как будто это вывод pipeline. */
function fakeOutput(scores: Partial<Record<ClipClass, number>>) {
  return PROMPT_LIST.map(({ prompt, cls }) => ({
    label: prompt,
    score: (scores[cls] ?? 0) / CLASS_PROMPTS[cls].length,
  }));
}

const classify = (scores: Partial<Record<ClipClass, number>>) =>
  scoresToClassification(groupScores(fakeOutput(scores)));

describe('groupScores', () => {
  it('суммирует скоры промптов внутри класса и сортирует по убыванию', () => {
    const classes = groupScores(fakeOutput({ PLASTIC: 0.6, CLEAN: 0.3, OIL: 0.1 }));
    expect(classes[0]).toEqual({ cls: 'PLASTIC', score: 0.6 });
    expect(classes[1]).toEqual({ cls: 'CLEAN', score: 0.3 });
    expect(classes.map((c) => c.cls)).toHaveLength(8);
  });

  it('игнорирует незнакомые метки', () => {
    expect(groupScores([{ label: 'something else', score: 1 }])).toEqual([]);
  });

  it('у каждого класса 2–3 промпта', () => {
    for (const prompts of Object.values(CLASS_PROMPTS)) {
      expect(prompts.length).toBeGreaterThanOrEqual(2);
      expect(prompts.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('scoresToClassification', () => {
  it('явный пластик → PLASTIC, уверенность внутри «загрязнения»', () => {
    const r = classify({ PLASTIC: 0.7, TRASH: 0.2, CLEAN: 0.1 });
    expect(r).toMatchObject({ isPollution: true, category: 'PLASTIC', severity: 3 });
    expect(r.confidence).toBeCloseTo(0.778, 2); // 0.7 / 0.9
  });

  it('чистый пляж → isPollution=false', () => {
    const r = classify({ CLEAN: 0.8, TRASH: 0.1, PLASTIC: 0.1 });
    expect(r).toMatchObject({ isPollution: false, category: 'OTHER', severity: 1 });
    expect(r.summaryRu).toMatch(/не видно/);
  });

  it('селфи/помещение → isPollution=false с другим текстом', () => {
    const r = classify({ IRRELEVANT: 0.9, CLEAN: 0.1 });
    expect(r.isPollution).toBe(false);
    expect(r.summaryRu).toMatch(/не относится/);
  });

  it('граница: масса загрязнения ровно 0.5 — считается загрязнением', () => {
    expect(classify({ TRASH: 0.5, CLEAN: 0.5 }).isPollution).toBe(true);
    expect(classify({ TRASH: 0.49, CLEAN: 0.51 }).isPollution).toBe(false);
  });

  it('загрязнение побеждает суммой, даже если топ-1 — CLEAN', () => {
    const r = classify({ CLEAN: 0.4, TRASH: 0.3, PLASTIC: 0.3 });
    expect(r.isPollution).toBe(true);
    expect(r.confidence).toBe(0.5); // низкая — бот попросит подтвердить
  });

  it('опасные категории при уверенности > 0.7 получают +1 к severity', () => {
    expect(classify({ SEWAGE: 0.9, CLEAN: 0.1 }).severity).toBe(5); // 4 + 1
    expect(classify({ SEWAGE: 0.4, TRASH: 0.3, CLEAN: 0.3 }).severity).toBe(4); // 0.57 — без бонуса
    expect(classify({ OIL: 0.95, CLEAN: 0.05 }).severity).toBe(5); // 5 + 1 → clamp 5
    expect(classify({ PLASTIC: 0.95, CLEAN: 0.05 }).severity).toBe(3); // не опасная — без бонуса
  });

  it('результат всегда проходит Zod-схему', () => {
    const cases: Partial<Record<ClipClass, number>>[] = [
      { OIL: 1 },
      { CLEAN: 1 },
      { IRRELEVANT: 1 },
      { DEAD_ANIMAL: 0.34, CONSTRUCTION: 0.33, CLEAN: 0.33 },
    ];
    for (const c of cases) expect(() => ClassificationSchema.parse(classify(c))).not.toThrow();
  });

  it('пустой вывод модели не ломает маппинг', () => {
    const empty: ClassScore[] = [];
    expect(scoresToClassification(empty).isPollution).toBe(false);
  });
});
