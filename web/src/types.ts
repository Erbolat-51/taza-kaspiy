export type Category =
  'TRASH' | 'PLASTIC' | 'OIL' | 'DEAD_ANIMAL' | 'SEWAGE' | 'CONSTRUCTION' | 'OTHER';

export type ReportStatus =
  'NEW' | 'CONFIRMED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export type ZoneKind = 'CITY_BEACH' | 'WILD_COAST' | 'PORT_INDUSTRIAL' | 'RESORT' | 'SETTLEMENT';

export type Lang = 'kk' | 'ru';

export interface ZoneRef {
  id: number;
  slug: string;
  nameKk: string;
  nameRu: string;
  kind: ZoneKind;
}

export interface ExecutorRef {
  id: number;
  nameKk: string;
  nameRu: string;
  kind: string;
}

export interface Report {
  id: number;
  code: string;
  source: 'BOT' | 'WEB';
  lat: number;
  lng: number;
  zoneId: number | null;
  comment: string | null;
  photo: string;
  photoThumb: string;
  afterPhoto: string | null;
  category: Category;
  severity: number;
  aiConfidence: number;
  aiSummaryKk: string | null;
  aiSummaryRu: string | null;
  aiProvider: 'claude' | 'clip' | 'mock' | null;
  categoryConfirmedByUser: boolean;
  status: ReportStatus;
  executorId: number | null;
  parentId: number | null;
  duplicatesCount: number;
  rejectReason: string | null;
  createdAt: string;
  assignedAt: string | null;
  resolvedAt: string | null;
  isDemo: boolean;
  zone: ZoneRef | null;
  executor: ExecutorRef | null;
}

export type EventType =
  'CREATED' | 'AI_CLASSIFIED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'AFTER_PHOTO' | 'COMMENT';

export interface ReportEvent {
  id: number;
  type: EventType;
  payload: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface ReportDetails extends Report {
  events: ReportEvent[];
  duplicates: { id: number; code: string; photoThumb: string; createdAt: string }[];
  parent: { id: number; code: string } | null;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface Zone extends ZoneRef {
  polygon: GeoPolygon;
  centerLat: number;
  centerLng: number;
  cleanIndex: number;
  color: 'green' | 'yellow' | 'red';
  openCount: number;
}

export interface Summary {
  open: number;
  resolved7d: number;
  avgIndex: number;
}
