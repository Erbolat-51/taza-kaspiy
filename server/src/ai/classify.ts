import { mockClassify } from './mock.js';
import type { ClassifyResult } from './types.js';

export interface ClassifyInput {
  image: Buffer;
  mimeType: string;
  comment?: string | null;
}

/**
 * Классификация фото. Фаза 1: только mock.
 * Фаза 2: Claude vision с таймаутом и fallback на mock — демо не падает никогда.
 */
export async function classifyPhoto(input: ClassifyInput): Promise<ClassifyResult> {
  return mockClassify(input.comment);
}
