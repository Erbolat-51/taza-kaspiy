import { EventEmitter } from 'node:events';
import type { Category, ReportStatus } from '@prisma/client';
import type { ReportWithRefs } from '../services/reportShape.js';

/**
 * Шина доменных событий. Сервисы только публикуют события,
 * а Socket.IO и Telegram-бот подписываются — сервисы о них ничего не знают.
 */
export type ReportChange =
  | { type: 'status'; from: ReportStatus; to: ReportStatus }
  | { type: 'assigned'; executorId: number }
  | { type: 'afterPhoto' }
  | { type: 'duplicate'; childId: number }
  | { type: 'category'; from: Category; to: Category };

export interface BusEvents {
  'report:created': { report: ReportWithRefs; duplicateOf: number | null };
  'report:updated': { report: ReportWithRefs; change: ReportChange; actor: string };
  'zone:index': { zoneId: number; cleanIndex: number };
}

class TypedBus {
  private ee = new EventEmitter();

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.ee.emit(event, payload);
  }

  on<K extends keyof BusEvents>(event: K, listener: (payload: BusEvents[K]) => void): () => void {
    // Ошибка одного подписчика (например, Telegram недоступен) не должна ронять запрос
    const safe = (p: BusEvents[K]) => {
      Promise.resolve()
        .then(() => listener(p))
        .catch((err) => this.ee.emit('error', err));
    };
    this.ee.on(event, safe);
    return () => this.ee.off(event, safe);
  }

  onError(handler: (err: unknown) => void) {
    this.ee.on('error', handler);
  }
}

export const bus = new TypedBus();
