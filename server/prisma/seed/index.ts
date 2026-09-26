import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ExecutorKind, PrismaClient, ZoneKind } from '@prisma/client';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

const ZonesFile = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      properties: z.object({
        slug: z.string(),
        nameKk: z.string(),
        nameRu: z.string(),
        kind: z.nativeEnum(ZoneKind),
      }),
      geometry: z.object({
        type: z.literal('Polygon'),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
      }),
    }),
  ),
});

/** Центр полигона — среднее вершин внешнего кольца (без замыкающей точки). */
function ringCenter(ring: [number, number][]): { lat: number; lng: number } {
  const pts = ring.slice(0, -1);
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

async function seedZones() {
  const raw = JSON.parse(readFileSync(join(here, 'zones.geojson'), 'utf8'));
  const { features } = ZonesFile.parse(raw);
  for (const f of features) {
    const outer = f.geometry.coordinates[0];
    if (!outer || outer.length < 4) throw new Error(`Zone ${f.properties.slug}: bad polygon`);
    const c = ringCenter(outer);
    const data = {
      nameKk: f.properties.nameKk,
      nameRu: f.properties.nameRu,
      kind: f.properties.kind,
      polygon: f.geometry,
      centerLat: c.lat,
      centerLng: c.lng,
    };
    await prisma.zone.upsert({
      where: { slug: f.properties.slug },
      create: { slug: f.properties.slug, ...data },
      update: data,
    });
  }
  console.log(`✔ zones: ${features.length}`);
}

const EXECUTORS: { nameKk: string; nameRu: string; kind: ExecutorKind }[] = [
  {
    nameKk: 'Қалалық коммуналдық қызмет',
    nameRu: 'Городская коммунальная служба',
    kind: 'UTILITY',
  },
  { nameKk: 'Экология басқармасы', nameRu: 'Управление экологии', kind: 'ECOLOGY' },
  { nameKk: 'Еріктілер штабы', nameRu: 'Штаб волонтёров', kind: 'VOLUNTEER_ORG' },
  { nameKk: 'Жануарларды құтқару тобы', nameRu: 'Группа спасения животных', kind: 'ANIMAL_RESCUE' },
];

const linkCode = () => randomBytes(3).toString('hex').toUpperCase();

async function seedExecutors() {
  for (const e of EXECUTORS) {
    const existing = await prisma.executor.findFirst({ where: { nameKk: e.nameKk } });
    if (existing) {
      await prisma.executor.update({
        where: { id: existing.id },
        data: { nameRu: e.nameRu, kind: e.kind, linkCode: existing.linkCode ?? linkCode() },
      });
    } else {
      await prisma.executor.create({ data: { ...e, linkCode: linkCode() } });
    }
  }
  console.log(`✔ executors: ${EXECUTORS.length}`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@taza.kz';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, name: 'Әкімдік операторы', role: 'ADMIN' },
    update: { passwordHash },
  });
  console.log(`✔ admin: ${email}`);
}

/** В проде демо-пароль недопустим: админка открыта в интернет. Проверяем до любых записей. */
function assertProductionPassword() {
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  if (process.env.NODE_ENV === 'production' && (password === 'admin123' || password.length < 12)) {
    throw new Error('ADMIN_PASSWORD must be a generated password of 12+ chars in production');
  }
}

async function main() {
  assertProductionPassword();
  await seedZones();
  await seedExecutors();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
