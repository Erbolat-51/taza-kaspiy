import type { Report, ReportDetails } from '../types';

export interface ClassScore {
  cls: string;
  score: number;
}

/** Сырой ответ классификатора, как его сохранил сервер (Report.aiRaw). */
export interface AiRaw {
  provider?: 'claude' | 'clip' | 'mock';
  raw?: {
    model?: string;
    dtype?: string;
    top3?: ClassScore[];
    ms?: number;
    providerMs?: number;
    fallbackReason?: string;
    matched?: string | null;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

export interface Author {
  id: number;
  username: string | null;
  firstName: string | null;
  lang: 'kk' | 'ru';
}

export interface AdminReport extends Report {
  aiRaw?: AiRaw | null;
  tgUser?: Author | null;
}

export interface AdminDetails extends ReportDetails {
  aiRaw: AiRaw | null;
  tgUser: Author | null;
  duplicates: {
    id: number;
    code: string;
    photoThumb: string;
    createdAt: string;
    comment: string | null;
  }[];
}

export interface Executor {
  id: number;
  nameKk: string;
  nameRu: string;
  kind: 'UTILITY' | 'ECOLOGY' | 'VOLUNTEER_ORG' | 'ANIMAL_RESCUE';
  linkCode: string | null;
  linked: boolean;
  activeTasks: number;
  tgUser: { username: string | null; firstName: string | null } | null;
}

export interface ZoneStat {
  id: number;
  nameKk: string;
  nameRu: string;
  cleanIndex: number;
  color: 'green' | 'yellow' | 'red';
  open: number;
}

export interface Dashboard {
  kpi: {
    newToday: number;
    inWork: number;
    resolvedWeek: number;
    avgResolveHours: number | null;
    avgIndex: number;
  };
  daily: { day: string; created: number; resolved: number }[];
  byCategory: Record<string, number>;
  zones: ZoneStat[];
  topProblemZones: ZoneStat[];
  heat: [number, number, number][];
}
