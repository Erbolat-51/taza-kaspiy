import type { Category } from '@prisma/client';
import type { ClassifyResult } from './types.js';

/** Ключевые слова (kk/ru, нижний регистр, по корню). Порядок важен: опасное — раньше. */
const RULES: { category: Category; severity: number; words: string[] }[] = [
  { category: 'OIL', severity: 5, words: ['мұнай', 'нефт', 'мазут', 'битум'] },
  {
    category: 'DEAD_ANIMAL',
    severity: 4,
    words: ['итбалық', 'тюлен', 'нерп', 'өлі', 'дохл', 'мёртв', 'мертв', 'труп'],
  },
  {
    category: 'SEWAGE',
    severity: 4,
    words: ['кәріз', 'канализ', 'сток', 'ағынды', 'сасық', 'вонь'],
  },
  {
    category: 'PLASTIC',
    severity: 3,
    words: ['пластик', 'бөтелке', 'бутыл', 'пакет', 'полиэтилен'],
  },
  {
    category: 'CONSTRUCTION',
    severity: 3,
    words: ['құрылыс', 'строит', 'бетон', 'кирпич', 'кірпіш', 'щеб'],
  },
  { category: 'TRASH', severity: 2, words: ['қоқыс', 'мусор', 'қалдық', 'отход', 'свалк'] },
];

const SUMMARY: Record<Category, { kk: string; ru: string }> = {
  TRASH: { kk: 'Жағалаудағы тұрмыстық қоқыс', ru: 'Бытовой мусор на берегу' },
  PLASTIC: { kk: 'Жағалаудағы пластик қоқыс', ru: 'Пластиковый мусор на берегу' },
  OIL: { kk: 'Мұнай ластануының белгілері', ru: 'Признаки нефтяного загрязнения' },
  DEAD_ANIMAL: { kk: 'Жағалауда өлі жануар', ru: 'Мёртвое животное на берегу' },
  SEWAGE: { kk: 'Ағынды сулардың төгілуі', ru: 'Сброс сточных вод' },
  CONSTRUCTION: { kk: 'Құрылыс қалдықтары', ru: 'Строительный мусор' },
  OTHER: { kk: 'Ластану', ru: 'Загрязнение' },
};

/** Severity по умолчанию, когда категорию выбрал сам житель (ИИ недоступен). */
export const DEFAULT_SEVERITY: Record<Category, number> = {
  OIL: 5,
  DEAD_ANIMAL: 4,
  SEWAGE: 4,
  PLASTIC: 3,
  CONSTRUCTION: 3,
  TRASH: 2,
  OTHER: 2,
};

/** Классификатор без ИИ: по ключевым словам комментария. Никогда не бросает исключений. */
export function mockClassify(comment?: string | null): ClassifyResult {
  const text = (comment ?? '').toLowerCase();
  const rule = RULES.find((r) => r.words.some((w) => text.includes(w)));
  const category: Category = rule?.category ?? 'TRASH';
  return {
    isPollution: true,
    category,
    severity: rule?.severity ?? 2,
    confidence: rule ? 0.6 : 0.3,
    summaryKk: SUMMARY[category].kk,
    summaryRu: SUMMARY[category].ru,
    provider: 'mock',
    raw: { mock: true, matched: rule?.category ?? null },
  };
}
