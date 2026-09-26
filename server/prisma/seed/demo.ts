/**
 * Демо-история: ~150 репортов за 60 дней (isDemo=true) — чтобы карта, тепловая карта и дашборд
 * выглядели «живыми». Детерминированно (фиксированный seed), повторный запуск пересоздаёт демо.
 *
 * Реалистичность:
 *  - городские пляжи — больше мусора и пластика, пик в августе и на выходных;
 *  - нефть — редко и в основном у порта / Баутино / Курыка; мёртвые животные — единично на диком берегу;
 *  - ~70% убраны: время устранения в городе ~сутки, у порта и в посёлках — дольше;
 *  - свежие репорты чаще открыты, старые почти все закрыты;
 *  - несколько дубликатов (×N на карте), история событий как у настоящих репортов.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Prisma, PrismaClient, type Category, type ReportStatus } from '@prisma/client';
import { computeCleanIndex } from '../../src/domain/cleanIndex.js';
import { findZone, type PolygonGeometry } from '../../src/geo/geo.js';
import { SUMMARY } from '../../src/ai/mock.js';
import { cleanSvg, pollutionSvg } from './demoPhotos.js';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const TOTAL = 150;
const now = Date.now();

// ── детерминированный генератор ──
let seed = 20260926;
const rnd = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};
const pick = <T>(items: [T, number][]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * total;
  for (const [v, w] of items) if ((x -= w) <= 0) return v;
  return items[items.length - 1]![0];
};
/** Логнормальное время устранения: медиана в часах, разброс ×/÷ ~2.5. */
const lognormalHours = (medianH: number) => {
  const u = Math.max(1e-6, rnd());
  const v = rnd();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return medianH * Math.exp(0.9 * z);
};

// ── профили участков ──
type Profile = { weight: number; cats: [Category, number][]; resolveMedianH: number };
const CITY: [Category, number][] = [
  ['TRASH', 42],
  ['PLASTIC', 38],
  ['SEWAGE', 7],
  ['CONSTRUCTION', 8],
  ['OTHER', 5],
];
const PROFILES: Record<string, Profile> = {
  'city-beach': { weight: 30, cats: CITY, resolveMedianH: 14 },
  'mkr-6-9': { weight: 22, cats: CITY, resolveMedianH: 18 },
  'mkr-1-5': { weight: 18, cats: CITY, resolveMedianH: 18 },
  'mkr-11-15': { weight: 16, cats: CITY, resolveMedianH: 22 },
  'warm-beach': {
    weight: 12,
    cats: [
      ['PLASTIC', 45],
      ['TRASH', 40],
      ['OIL', 5],
      ['SEWAGE', 10],
    ],
    resolveMedianH: 20,
  },
  'port-industrial': {
    weight: 10,
    cats: [
      ['OIL', 35],
      ['TRASH', 30],
      ['CONSTRUCTION', 25],
      ['PLASTIC', 10],
    ],
    resolveMedianH: 60,
  },
  'north-wild': {
    weight: 10,
    cats: [
      ['PLASTIC', 45],
      ['TRASH', 25],
      ['DEAD_ANIMAL', 18],
      ['CONSTRUCTION', 12],
    ],
    resolveMedianH: 55,
  },
  akshukur: {
    weight: 6,
    cats: [
      ['TRASH', 45],
      ['PLASTIC', 35],
      ['DEAD_ANIMAL', 10],
      ['CONSTRUCTION', 10],
    ],
    resolveMedianH: 50,
  },
  'fort-shevchenko': {
    weight: 6,
    cats: [
      ['TRASH', 50],
      ['PLASTIC', 35],
      ['CONSTRUCTION', 15],
    ],
    resolveMedianH: 45,
  },
  bautino: {
    weight: 6,
    cats: [
      ['TRASH', 35],
      ['PLASTIC', 30],
      ['OIL', 20],
      ['CONSTRUCTION', 15],
    ],
    resolveMedianH: 50,
  },
  kuryk: {
    weight: 7,
    cats: [
      ['TRASH', 35],
      ['OIL', 20],
      ['PLASTIC', 30],
      ['CONSTRUCTION', 15],
    ],
    resolveMedianH: 55,
  },
  kendirli: {
    weight: 7,
    cats: [
      ['PLASTIC', 50],
      ['TRASH', 40],
      ['DEAD_ANIMAL', 10],
    ],
    resolveMedianH: 40,
  },
};

const BASE_SEVERITY: Record<Category, number> = {
  OIL: 5,
  DEAD_ANIMAL: 4,
  SEWAGE: 4,
  PLASTIC: 3,
  CONSTRUCTION: 3,
  TRASH: 2,
  OTHER: 2,
};
const EXECUTOR_BY_CAT: Record<Category, string> = {
  TRASH: 'UTILITY',
  PLASTIC: 'UTILITY',
  CONSTRUCTION: 'UTILITY',
  OTHER: 'UTILITY',
  OIL: 'ECOLOGY',
  SEWAGE: 'ECOLOGY',
  DEAD_ANIMAL: 'ANIMAL_RESCUE',
};
const COMMENTS: Partial<Record<Category, string[]>> = {
  TRASH: [
    'Жағада қоқыс көп',
    'Мусор после выходных',
    'Пикниктен кейін қалған қоқыс',
    'Переполнены урны',
  ],
  PLASTIC: [
    'Пластик бөтелкелер',
    'Много бутылок у воды',
    'Пакеттер жағаға шығып қалған',
    'Пластик после шторма',
  ],
  OIL: ['Мұнай дақтары', 'Нефтяные пятна на песке', 'Судан мазут иісі шығады'],
  DEAD_ANIMAL: ['Өлі итбалық жатыр', 'Мёртвый тюлень на берегу', 'Көп өлі балық'],
  SEWAGE: ['Құбырдан сасық су ағып жатыр', 'Сток из трубы в море'],
  CONSTRUCTION: ['Құрылыс қалдықтары төгілген', 'Кто-то вывалил строительный мусор'],
};
const REJECT_REASONS = ['Жағалау емес / не побережье', 'Повторное сообщение', 'Фото не по теме'];

// ── фото ──
const uploadsRoot = resolve(process.env.UPLOADS_DIR ?? './uploads');
const demoDir = join(uploadsRoot, 'demo');
const VARIANTS = 3;

async function writePhotos() {
  await mkdir(demoDir, { recursive: true });
  const cats: Category[] = [
    'PLASTIC',
    'TRASH',
    'OIL',
    'DEAD_ANIMAL',
    'SEWAGE',
    'CONSTRUCTION',
    'OTHER',
  ];
  for (const c of cats) {
    for (let i = 1; i <= VARIANTS; i++) {
      await writeFile(join(demoDir, `${c.toLowerCase()}-${i}.svg`), pollutionSvg(c, rnd));
    }
  }
  for (let i = 1; i <= 2; i++) await writeFile(join(demoDir, `clean-${i}.svg`), cleanSvg(rnd));
}
const photoOf = (c: Category) =>
  `/uploads/demo/${c.toLowerCase()}-${1 + Math.floor(rnd() * VARIANTS)}.svg`;
const cleanPhoto = () => `/uploads/demo/clean-${1 + Math.floor(rnd() * 2)}.svg`;

// ── время: больше в августе и на выходных, днём/вечером ──
function randomCreatedAt(): number {
  for (;;) {
    const daysAgo = rnd() * 60;
    const ts = now - daysAgo * DAY;
    const d = new Date(ts + 5 * HOUR); // время Актау
    const season = daysAgo > 30 ? 1.4 : daysAgo > 10 ? 1.0 : 0.8;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 1.5 : 1;
    if (rnd() * 2.1 > season * weekend) continue;
    const hour = pick<number>([
      [8, 1],
      [10, 2],
      [12, 3],
      [14, 3],
      [16, 4],
      [18, 5],
      [20, 3],
      [21, 1],
    ]);
    const local = new Date(d);
    local.setUTCHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
    const result = local.getTime() - 5 * HOUR;
    if (result < now - 10 * 60_000) return result;
  }
}

/** Ширина полигона по долготе на данной широте (пересечения горизонтали с рёбрами). */
function lngSpanAt(ring: [number, number][], lat: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
  }
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
}

function randomPointIn(
  poly: PolygonGeometry,
  zones: { id: number; polygon: PolygonGeometry }[],
  zoneId: number,
) {
  const ring = poly.coordinates[0]!;
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  for (let i = 0; i < 3000; i++) {
    const lng = Math.min(...lngs) + rnd() * (Math.max(...lngs) - Math.min(...lngs));
    const lat = Math.min(...lats) + rnd() * (Math.max(...lats) - Math.min(...lats));
    if (findZone(lat, lng, zones)?.id !== zoneId) continue;
    // Полоса зоны уходит на ~300 м в море — берём точки у береговой (восточной) части полосы
    const span = lngSpanAt(ring, lat);
    if (!span) continue;
    const f = (lng - span[0]) / (span[1] - span[0]);
    if (f >= 0.52 && f <= 0.88) return { lat, lng };
  }
  throw new Error(`no point for zone ${zoneId}`);
}

function planStatus(ageH: number, medianH: number) {
  const resolveH = Math.max(0.7, lognormalHours(medianH));
  const assignAfterH = Math.min(resolveH * rand(0.15, 0.4), 8);
  const startAfterH = assignAfterH + Math.min((resolveH - assignAfterH) * rand(0.2, 0.6), 12);
  // Отклонённые — небольшая доля
  if (rnd() < 0.05 && ageH > 6) {
    return {
      status: 'REJECTED' as ReportStatus,
      assignH: null,
      startH: null,
      resolveH: rand(1, 10),
    };
  }
  // Часть старых остаётся «хвостом»: дальние участки, забытые заявки
  const stale = ageH > 3 * 24 && rnd() < (medianH > 40 ? 0.34 : 0.17);
  if (!stale && resolveH < ageH)
    return {
      status: 'RESOLVED' as ReportStatus,
      assignH: assignAfterH,
      startH: startAfterH,
      resolveH,
    };
  if (startAfterH < ageH && !stale)
    return {
      status: 'IN_PROGRESS' as ReportStatus,
      assignH: assignAfterH,
      startH: startAfterH,
      resolveH: null,
    };
  if (assignAfterH < ageH && rnd() < 0.7)
    return {
      status: 'ASSIGNED' as ReportStatus,
      assignH: assignAfterH,
      startH: null,
      resolveH: null,
    };
  return {
    status: (rnd() < 0.3 ? 'CONFIRMED' : 'NEW') as ReportStatus,
    assignH: null,
    startH: null,
    resolveH: null,
  };
}
function rand(a: number, b: number) {
  return a + rnd() * (b - a);
}

function top3For(category: Category, confidence: number) {
  const others = (['PLASTIC', 'TRASH', 'CLEAN', 'OIL', 'SEWAGE', 'CONSTRUCTION'] as const).filter(
    (c) => c !== category,
  );
  const top = Math.round(confidence * rand(0.82, 0.95) * 1000) / 1000;
  const second = Math.round((1 - top) * rand(0.45, 0.7) * 1000) / 1000;
  const third = Math.round((1 - top - second) * rand(0.3, 0.6) * 1000) / 1000;
  return [
    { cls: category, score: top },
    { cls: others[Math.floor(rnd() * others.length)]!, score: second },
    { cls: others[Math.floor(rnd() * others.length)]!, score: third },
  ];
}

async function main() {
  // 0. Повторный запуск — пересоздаём демо с нуля
  const removed = await prisma.report.deleteMany({ where: { isDemo: true } });
  await prisma.cleanup.deleteMany({ where: { isDemo: true } });
  if (removed.count) console.log(`↺ removed previous demo reports: ${removed.count}`);
  // Чистая база (после demo:reset) — нумерация демо с ТК-0001
  if ((await prisma.report.count()) === 0) {
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "Report_id_seq" RESTART WITH 1');
  }

  await writePhotos();
  const zones = (await prisma.zone.findMany()).map((z) => ({
    ...z,
    polygon: z.polygon as unknown as PolygonGeometry,
  }));
  const bySlug = new Map(zones.map((z) => [z.slug, z]));
  const executors = await prisma.executor.findMany();
  const execByKind = new Map(executors.map((e) => [e.kind, e]));

  type Planned = {
    data: Prisma.ReportCreateManyInput;
    events: Omit<Prisma.ReportEventCreateManyInput, 'reportId'>[];
    zoneSlug: string;
  };
  const planned: Planned[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const slug = pick(Object.entries(PROFILES).map(([s, p]) => [s, p.weight] as [string, number]));
    const profile = PROFILES[slug]!;
    const zone = bySlug.get(slug)!;
    const category = pick(profile.cats);
    const createdAt = randomCreatedAt();
    const ageH = (now - createdAt) / HOUR;
    const { lat, lng } = randomPointIn(zone.polygon, zones, zone.id);
    const severity = Math.max(
      1,
      Math.min(
        5,
        BASE_SEVERITY[category] +
          pick<number>([
            [-1, 2],
            [0, 5],
            [1, 2],
          ]),
      ),
    );
    const confidence =
      Math.round((rnd() < 0.15 ? rand(0.45, 0.6) : rand(0.62, 0.95)) * 1000) / 1000;
    const plan = planStatus(ageH, profile.resolveMedianH);
    const executor =
      plan.assignH !== null ? (execByKind.get(EXECUTOR_BY_CAT[category] as never) ?? null) : null;
    const source = rnd() < 0.82 ? 'BOT' : 'WEB';
    const comment =
      rnd() < 0.4
        ? pick((COMMENTS[category] ?? ['Ластану']).map((c) => [c, 1] as [string, number]))
        : null;
    const at = (h: number | null) => (h === null ? null : new Date(createdAt + h * HOUR));
    const resolvedAt = plan.status === 'RESOLVED' ? at(plan.resolveH) : null;

    const events: Planned['events'] = [
      {
        type: 'CREATED',
        actor: source === 'BOT' ? 'tg:demo' : 'web',
        createdAt: new Date(createdAt),
        payload: { source, zoneId: zone.id, duplicateOf: null },
      },
      {
        type: 'AI_CLASSIFIED',
        actor: 'system',
        createdAt: new Date(createdAt + 2500),
        payload: { provider: 'clip', category, severity, confidence },
      },
    ];
    if (source === 'BOT' && rnd() < 0.6) {
      events.push({
        type: 'COMMENT',
        actor: 'tg:demo',
        createdAt: new Date(createdAt + 20_000),
        payload: { kind: 'category', from: category, to: category, confirmed: true },
      });
    }
    if (executor && plan.assignH !== null) {
      events.push(
        {
          type: 'ASSIGNED',
          actor: 'admin:operator@taza.kz',
          createdAt: at(plan.assignH)!,
          payload: {
            executorId: executor.id,
            executorNameKk: executor.nameKk,
            executorNameRu: executor.nameRu,
          },
        },
        {
          type: 'STATUS_CHANGED',
          actor: 'admin:operator@taza.kz',
          createdAt: at(plan.assignH)!,
          payload: { from: 'NEW', to: 'ASSIGNED' },
        },
      );
    }
    if (executor && plan.startH !== null) {
      events.push({
        type: 'STATUS_CHANGED',
        actor: `executor:${executor.id}`,
        createdAt: at(plan.startH)!,
        payload: { from: 'ASSIGNED', to: 'IN_PROGRESS' },
      });
    }
    const afterPhoto = resolvedAt ? cleanPhoto() : null;
    if (resolvedAt && executor) {
      events.push(
        {
          type: 'AFTER_PHOTO',
          actor: `executor:${executor.id}`,
          createdAt: resolvedAt,
          payload: { photo: afterPhoto },
        },
        {
          type: 'STATUS_CHANGED',
          actor: `executor:${executor.id}`,
          createdAt: resolvedAt,
          payload: { from: 'IN_PROGRESS', to: 'RESOLVED' },
        },
      );
    }
    const rejectReason =
      plan.status === 'REJECTED'
        ? pick(REJECT_REASONS.map((r) => [r, 1] as [string, number]))
        : null;
    if (rejectReason) {
      events.push({
        type: 'STATUS_CHANGED',
        actor: 'admin:operator@taza.kz',
        createdAt: at(plan.resolveH)!,
        payload: { from: 'NEW', to: 'REJECTED', reason: rejectReason },
      });
    }
    if (plan.status === 'CONFIRMED') {
      events.push({
        type: 'STATUS_CHANGED',
        actor: 'admin:operator@taza.kz',
        createdAt: new Date(createdAt + rand(0.3, 3) * HOUR),
        payload: { from: 'NEW', to: 'CONFIRMED' },
      });
    }

    const photo = photoOf(category);
    planned.push({
      zoneSlug: slug,
      events,
      data: {
        code: `demo-${i}`,
        source,
        lat,
        lng,
        zoneId: zone.id,
        comment,
        photo,
        photoThumb: photo,
        afterPhoto,
        category,
        severity,
        aiConfidence: confidence,
        aiSummaryKk: SUMMARY[category].kk,
        aiSummaryRu: SUMMARY[category].ru,
        aiRaw: {
          provider: 'clip',
          raw: {
            model: 'Xenova/clip-vit-base-patch32',
            dtype: 'q8',
            top3: top3For(category, confidence),
            ms: Math.round(rand(140, 420)),
            demo: true,
          },
        },
        categoryConfirmedByUser: events.some((e) => e.type === 'COMMENT'),
        status: plan.status,
        executorId: executor?.id ?? null,
        createdAt: new Date(createdAt),
        assignedAt: at(plan.assignH),
        resolvedAt,
        rejectReason,
        isDemo: true,
      },
    });
  }

  // 1. Репорты по хронологии — коды ТК-… идут по возрастанию времени
  planned.sort(
    (a, b) => (a.data.createdAt as Date).getTime() - (b.data.createdAt as Date).getTime(),
  );
  const ids: number[] = [];
  for (const p of planned) {
    const r = await prisma.report.create({
      data: p.data as Prisma.ReportUncheckedCreateInput,
      select: { id: true },
    });
    ids.push(r.id);
  }

  // 2. Дубликаты: ~10 «ещё один житель сообщил о том же месте»
  let dupCount = 0;
  for (let k = 0; k < planned.length && dupCount < 10; k++) {
    if (rnd() > 0.09) continue;
    const parent = planned[k]!.data;
    const parentId = ids[k]!;
    // Дубликат приходит, пока родитель ещё открыт
    const pStart = (parent.createdAt as Date).getTime();
    const pEnd = parent.resolvedAt ? (parent.resolvedAt as Date).getTime() : now;
    if (pEnd - pStart < HOUR) continue;
    const createdAt = new Date(
      pStart + Math.min(rand(1, 30) * HOUR, (pEnd - pStart) * rand(0.2, 0.8)),
    );
    const child = await prisma.report.create({
      data: {
        ...(parent as Prisma.ReportUncheckedCreateInput),
        code: `demo-dup-${k}`,
        lat: parent.lat + rand(-0.00015, 0.00015),
        lng: parent.lng + rand(-0.00015, 0.00015),
        comment: null,
        parentId,
        createdAt,
        categoryConfirmedByUser: false,
      },
      select: { id: true },
    });
    await prisma.report.update({
      where: { id: parentId },
      data: { duplicatesCount: { increment: 1 } },
    });
    await prisma.reportEvent.createMany({
      data: [
        {
          reportId: child.id,
          type: 'CREATED',
          actor: 'tg:demo',
          createdAt,
          payload: { source: 'BOT', zoneId: parent.zoneId, duplicateOf: parentId },
        },
      ],
    });
    dupCount++;
  }

  // 3. История событий одним пакетом
  const events = planned.flatMap((p, i) => p.events.map((e) => ({ ...e, reportId: ids[i]! })));
  for (let i = 0; i < events.length; i += 500) {
    await prisma.reportEvent.createMany({
      data: events.slice(i, i + 500) as Prisma.ReportEventCreateManyInput[],
    });
  }

  // 4. Коды ТК-XXXX по id
  await prisma.$executeRaw`UPDATE "Report" SET code = 'ТК-' || lpad(id::text, 4, '0') WHERE code LIKE 'demo-%'`;

  // 5. Демо-субботники
  const plannedCleanups = [
    {
      slug: 'city-beach',
      days: 4,
      title: 'Қалалық жағажайды бірге тазалайық',
      point: 'Маяк жанында, 10:00',
    },
    {
      slug: 'north-wild',
      days: 11,
      title: 'Солтүстік жағалау: күзгі сенбілік',
      point: '17-шағынаудан аялдамасы, 09:30',
    },
    {
      slug: 'mkr-6-9',
      days: -20,
      title: '6–9 шағынаудан жағалауы: жазғы сенбілік',
      point: '7-шағынаудан, жағажай кіреберісі',
    },
  ];
  for (const c of plannedCleanups) {
    const d = new Date(now + c.days * DAY);
    d.setUTCHours(5, 0, 0, 0); // 10:00 по Актау
    await prisma.cleanup.create({
      data: {
        zoneId: bySlug.get(c.slug)!.id,
        title: c.title,
        startsAt: d,
        meetingPoint: c.point,
        maxVolunteers: 40,
        status: c.days < 0 ? 'DONE' : 'PLANNED',
        isDemo: true,
      },
    });
  }

  // 6. Индексы чистоты
  for (const z of zones) {
    const open = await prisma.report.findMany({
      where: {
        zoneId: z.id,
        parentId: null,
        status: { in: ['NEW', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] },
      },
      select: { severity: true, createdAt: true },
    });
    await prisma.zone.update({
      where: { id: z.id },
      data: { cleanIndex: computeCleanIndex(open), indexUpdatedAt: new Date() },
    });
  }

  // Итог
  const stats = await prisma.report.groupBy({
    by: ['status'],
    where: { isDemo: true, parentId: null },
    _count: true,
  });
  const byCat = await prisma.report.groupBy({
    by: ['category'],
    where: { isDemo: true, parentId: null },
    _count: true,
  });
  const total = stats.reduce((s, x) => s + x._count, 0);
  const resolved = stats.find((s) => s.status === 'RESOLVED')?._count ?? 0;
  console.log(
    `✔ demo reports: ${total} (+${dupCount} duplicates), resolved ${Math.round((resolved / total) * 100)}%`,
  );
  console.log('  by status:', Object.fromEntries(stats.map((s) => [s.status, s._count])));
  console.log('  by category:', Object.fromEntries(byCat.map((s) => [s.category, s._count])));
  const zoneRows = await prisma.zone.findMany({
    orderBy: { cleanIndex: 'asc' },
    select: { slug: true, cleanIndex: true },
  });
  console.log(
    '  zone index:',
    zoneRows.map((z) => `${z.slug}:${Math.round(z.cleanIndex)}`).join(' '),
  );
  console.log(`✔ demo cleanups: ${plannedCleanups.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
