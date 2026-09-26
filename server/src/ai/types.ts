import { z } from 'zod';
import { CATEGORIES } from '../domain/constants.js';

export const ClassificationSchema = z.object({
  isPollution: z.boolean(),
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  summaryKk: z.string().min(1).max(500),
  summaryRu: z.string().min(1).max(500),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export interface ClassifyResult extends Classification {
  /** Откуда пришёл результат */
  provider: 'claude' | 'clip' | 'mock';
  raw: unknown;
}
