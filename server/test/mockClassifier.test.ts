import { describe, expect, it } from 'vitest';
import { mockClassify } from '../src/ai/mock.js';
import { ClassificationSchema } from '../src/ai/types.js';

describe('mockClassify', () => {
  it.each([
    ['Жағада мұнай дақтары', 'OIL'],
    ['Нефтяное пятно у берега', 'OIL'],
    ['Өлі итбалық жатыр', 'DEAD_ANIMAL'],
    ['Мёртвый тюлень', 'DEAD_ANIMAL'],
    ['Пластик бөтелкелер көп', 'PLASTIC'],
    ['Много бутылок и пакетов', 'PLASTIC'],
    ['Канализация течёт в море', 'SEWAGE'],
    ['Строительный мусор, бетон', 'CONSTRUCTION'],
  ])('%s → %s', (comment, category) => {
    expect(mockClassify(comment).category).toBe(category);
  });

  it('без комментария — TRASH, severity 2', () => {
    const r = mockClassify(undefined);
    expect(r.category).toBe('TRASH');
    expect(r.severity).toBe(2);
    expect(r.provider).toBe('mock');
  });

  it('результат проходит Zod-схему', () => {
    expect(() => ClassificationSchema.parse(mockClassify('нефть'))).not.toThrow();
  });
});
