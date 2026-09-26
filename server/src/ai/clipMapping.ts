import type { Category } from '@prisma/client';
import { DEFAULT_SEVERITY, SUMMARY } from './mock.js';
import type { Classification } from './types.js';

/**
 * Классы CLIP: 6 видов загрязнения + 2 «не загрязнение».
 * Несколько английских описаний на класс — CLIP понимает английский лучше всего,
 * а разные формулировки сглаживают случайность одного промпта.
 */
export const POLLUTION_CLASSES = [
  'PLASTIC',
  'TRASH',
  'OIL',
  'DEAD_ANIMAL',
  'SEWAGE',
  'CONSTRUCTION',
] as const satisfies readonly Category[];
export const CLEAN_CLASSES = ['CLEAN', 'IRRELEVANT'] as const;

export type PollutionClass = (typeof POLLUTION_CLASSES)[number];
export type ClipClass = PollutionClass | (typeof CLEAN_CLASSES)[number];

export const CLASS_PROMPTS: Record<ClipClass, string[]> = {
  PLASTIC: [
    'a photo of plastic bottles scattered on a beach',
    'a photo of plastic bags and plastic waste on the sea shore',
    'a photo of a pile of plastic litter on the sand',
  ],
  TRASH: [
    'a photo of garbage and litter on a beach',
    'a photo of household trash dumped on the shore',
    'a photo of rubbish, cans and food waste on the sand',
  ],
  OIL: [
    'a photo of an oil spill on the sea shore',
    'a photo of black oil stains and tar balls on the sand',
    'a photo of an oily rainbow film on the water',
  ],
  DEAD_ANIMAL: [
    'a photo of a dead seal lying on the beach',
    'a photo of dead fish washed up on the shore',
    'a photo of a dead bird on the sand',
  ],
  SEWAGE: [
    'a photo of sewage flowing into the sea from a pipe',
    'a photo of dirty foamy wastewater on the shore',
    'a photo of a drain pipe discharging murky water onto a beach',
  ],
  CONSTRUCTION: [
    'a photo of construction debris, concrete and bricks on the shore',
    'a photo of building rubble dumped on a beach',
    'a photo of broken concrete slabs and rebar by the sea',
  ],
  CLEAN: [
    'a photo of a clean empty sandy beach',
    'a photo of a clear blue sea and a clean shore',
    'a photo of a beautiful clean coastline',
  ],
  IRRELEVANT: [
    'a selfie of a person',
    'a photo of a room interior or an office',
    'a screenshot with text or a document',
  ],
};

/** Все промпты с обратной ссылкой на класс — для pipeline и обратного маппинга. */
export const PROMPT_LIST: { prompt: string; cls: ClipClass }[] = (
  Object.entries(CLASS_PROMPTS) as [ClipClass, string[]][]
).flatMap(([cls, prompts]) => prompts.map((prompt) => ({ prompt, cls })));

const CLASS_BY_PROMPT = new Map(PROMPT_LIST.map((p) => [p.prompt, p.cls]));

const HIGH_RISK: ReadonlySet<Category> = new Set(['OIL', 'DEAD_ANIMAL', 'SEWAGE']);

const NOT_POLLUTION_SUMMARY: Record<(typeof CLEAN_CLASSES)[number], { kk: string; ru: string }> = {
  CLEAN: { kk: 'Фотода ластану көрінбейді', ru: 'На фото загрязнение не видно' },
  IRRELEVANT: {
    kk: 'Фото жағалауға қатысты емес сияқты',
    ru: 'Фото, похоже, не относится к побережью',
  },
};

export interface ClassScore {
  cls: ClipClass;
  score: number;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Скоры по промптам → скоры по классам (сумма внутри класса), по убыванию. */
export function groupScores(results: { label: string; score: number }[]): ClassScore[] {
  const sums = new Map<ClipClass, number>();
  for (const { label, score } of results) {
    const cls = CLASS_BY_PROMPT.get(label);
    if (cls) sums.set(cls, (sums.get(cls) ?? 0) + score);
  }
  return [...sums.entries()]
    .map(([cls, score]) => ({ cls, score: round(score) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Классы → результат.
 * - isPollution: суммарная вероятность всех классов загрязнения ≥ 0.5.
 * - category: самый вероятный класс загрязнения.
 * - confidence: доля этого класса внутри «загрязнения» — насколько уверены именно в категории
 *   (при этом бот спрашивает подтверждение, если < 0.6). Для «не загрязнения» — масса CLEAN+IRRELEVANT.
 * - severity: базовая по категории, +1 для опасных категорий при confidence > 0.7.
 */
export function scoresToClassification(classes: ClassScore[]): Classification {
  const score = (cls: ClipClass) => classes.find((c) => c.cls === cls)?.score ?? 0;
  const pollutionMass = POLLUTION_CLASSES.reduce((s, c) => s + score(c), 0);

  if (pollutionMass < 0.5) {
    const top = CLEAN_CLASSES.reduce((a, b) => (score(a) >= score(b) ? a : b));
    return {
      isPollution: false,
      category: 'OTHER',
      severity: 1,
      confidence: round(1 - pollutionMass),
      summaryKk: NOT_POLLUTION_SUMMARY[top].kk,
      summaryRu: NOT_POLLUTION_SUMMARY[top].ru,
    };
  }

  const category = POLLUTION_CLASSES.reduce((a, b) => (score(a) >= score(b) ? a : b));
  const confidence = round(score(category) / pollutionMass);
  const bump = HIGH_RISK.has(category) && confidence > 0.7 ? 1 : 0;
  const severity = Math.max(1, Math.min(5, DEFAULT_SEVERITY[category] + bump));
  return {
    isPollution: true,
    category,
    severity,
    confidence,
    summaryKk: SUMMARY[category].kk,
    summaryRu: SUMMARY[category].ru,
  };
}
