import type { Context, SessionFlavor } from 'grammy';
import type { Lang } from '@prisma/client';

/** Шаги флоу репорта. Явная state machine вместо conversations — без replay и дублей побочных эффектов. */
export type Step = 'idle' | 'photo' | 'location' | 'comment' | 'processing' | 'afterPhoto';

export interface Draft {
  fileId?: string;
  lat?: number;
  lng?: number;
  comment?: string;
}

export interface SessionData {
  step: Step;
  draft: Draft;
  /** Исполнитель нажал «Орындалды» — ждём фото «после» для этого репорта */
  taskId?: number;
}

export interface BotUser {
  id: number;
  lang: Lang;
  firstName: string | null;
  /** Привязан как исполнитель (/link КОД) — получает задачи */
  executorId: number | null;
}

export type BotContext = Context & SessionFlavor<SessionData> & { user: BotUser };

export const initialSession = (): SessionData => ({ step: 'idle', draft: {} });
