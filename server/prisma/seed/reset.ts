/**
 * Чистый старт перед питчем: npm run demo:reset          — показать, что будет удалено (ничего не удаляет)
 *                            npm run demo:reset -- --yes — удалить
 *
 * Удаляет всё, что не isDemo: репорты (с историей и фото на диске), субботники, тестовых пользователей
 * симулятора бота. Реальные пользователи Telegram (подписчики) и привязки исполнителей остаются.
 */
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { computeCleanIndex } from '../../src/domain/cleanIndex.js';

const prisma = new PrismaClient();
const confirm = process.argv.includes('--yes');
const uploadsRoot = resolve(process.env.UPLOADS_DIR ?? './uploads');

/** Telegram-id пользователей симулятора (scripts/bot-sim.ts). */
const SIM_TG_IDS = [990_000_001n, 990_000_002n];

async function main() {
  const reports = await prisma.report.findMany({
    where: { isDemo: false },
    select: { id: true, code: true, status: true, photo: true, photoThumb: true, afterPhoto: true },
    orderBy: { id: 'asc' },
  });
  const cleanups = await prisma.cleanup.findMany({
    where: { isDemo: false },
    select: { id: true, title: true, _count: { select: { signups: true } } },
  });
  const simUsers = await prisma.tgUser.findMany({
    where: { telegramId: { in: SIM_TG_IDS } },
    select: { id: true, firstName: true },
  });
  const demoCount = await prisma.report.count({ where: { isDemo: true } });
  const realUsers = await prisma.tgUser.count({ where: { telegramId: { notIn: SIM_TG_IDS } } });

  console.log(
    confirm ? '🧹 demo:reset — УДАЛЕНИЕ' : '🔎 demo:reset — предпросмотр (ничего не удалено)',
  );
  console.log(`\nРепорты не-demo: ${reports.length}`);
  if (reports.length) console.log('  ' + reports.map((r) => `${r.code}(${r.status})`).join(', '));
  console.log(`Субботники не-demo: ${cleanups.length}`);
  for (const c of cleanups) console.log(`  #${c.id} «${c.title}», записей: ${c._count.signups}`);
  console.log(`Тестовые пользователи симулятора: ${simUsers.length}`);
  const files = reports
    .flatMap((r) => [r.photo, r.photoThumb, r.afterPhoto])
    .filter((p): p is string => !!p && !p.startsWith('/uploads/demo/'));
  console.log(`Фото на диске: ${files.length}`);
  // Файлы-сироты: остались от тестов, на них не ссылается ни один репорт
  const kept = await prisma.report.findMany({
    where: { isDemo: true },
    select: { photo: true, photoThumb: true, afterPhoto: true },
  });
  const referenced = new Set(kept.flatMap((r) => [r.photo, r.photoThumb, r.afterPhoto]));
  const onDisk = await readdir(join(uploadsRoot, 'r')).catch(() => [] as string[]);
  const orphans = onDisk
    .map((name) => `/uploads/r/${name}`)
    .filter((p) => !referenced.has(p) && !files.includes(p));
  console.log(`Файлы-сироты в uploads/r: ${orphans.length}`);
  console.log(
    `\nОстанется: демо-репортов ${demoCount}, реальных пользователей Telegram ${realUsers}, зоны, исполнители, админ.`,
  );

  if (!confirm) {
    console.log('\nЧтобы удалить: npm run demo:reset -- --yes');
    return;
  }

  await prisma.$transaction([
    // Сначала дубликаты (у них parentId), затем остальные; история удаляется каскадом
    prisma.report.deleteMany({ where: { isDemo: false, parentId: { not: null } } }),
    prisma.report.deleteMany({ where: { isDemo: false } }),
    prisma.cleanup.deleteMany({ where: { isDemo: false } }),
    prisma.executor.updateMany({
      where: { tgUserId: { in: simUsers.map((u) => u.id) } },
      data: { tgUserId: null },
    }),
    prisma.tgUser.deleteMany({ where: { telegramId: { in: SIM_TG_IDS } } }),
  ]);
  for (const f of [...files, ...orphans]) {
    await rm(join(uploadsRoot, f.replace(/^\/uploads\//, '')), { force: true });
  }

  // Индексы зон — только по демо-данным
  const zones = await prisma.zone.findMany({ select: { id: true } });
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
  console.log(
    `\n✔ Удалено: репортов ${reports.length}, субботников ${cleanups.length}, пользователей ${simUsers.length}, файлов ${files.length + orphans.length}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
