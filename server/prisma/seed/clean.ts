/**
 * Полная очистка перед демо:
 *   npm run db:clean          — предпросмотр (ничего не удаляет)
 *   npm run db:clean -- --yes — удалить
 *
 * Удаляет: ВСЕ репорты (включая демо) с историей, фото в uploads/demo и uploads/r,
 *          все субботники и записи на них, ВСЕХ пользователей Telegram; привязки исполнителей сбрасываются.
 * Сохраняет: зоны, исполнителей (без привязки), админов.
 * Затем: нумерация репортов снова с ТК-0001, индексы всех зон = 100.
 * После очистки перезапустите сервер (бот кэширует пользователей в памяти):
 *   powershell -ExecutionPolicy Bypass -File .\start-demo.ps1 -ServerOnly
 */
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const confirm = process.argv.includes('--yes');
const uploadsRoot = resolve(process.env.UPLOADS_DIR ?? './uploads');

const listFiles = async (dir: string) =>
  readdir(join(uploadsRoot, dir)).catch(() => [] as string[]);

async function main() {
  const [reportsDemo, reportsReal, events, cleanups, signups, tgUsers, linked] = await Promise.all([
    prisma.report.count({ where: { isDemo: true } }),
    prisma.report.count({ where: { isDemo: false } }),
    prisma.reportEvent.count(),
    prisma.cleanup.count(),
    prisma.cleanupSignup.count(),
    prisma.tgUser.count(),
    prisma.executor.count({ where: { tgUserId: { not: null } } }),
  ]);
  const [demoFiles, rFiles] = await Promise.all([listFiles('demo'), listFiles('r')]);
  const zones = await prisma.zone.count();
  const executors = await prisma.executor.count();
  const admins = await prisma.adminUser.findMany({ select: { email: true, role: true } });

  // Персональные данные (имена, username) в вывод не попадают — только количества
  console.log(
    confirm ? '🧹 db:clean — УДАЛЕНИЕ' : '🔎 db:clean — предпросмотр (ничего не удалено)',
  );
  console.log('\n── УДАЛИТСЯ ──');
  console.log(
    `Репорты: ${reportsDemo + reportsReal} (демо ${reportsDemo}, реальные ${reportsReal})`,
  );
  console.log(`События истории: ${events}`);
  console.log(
    `Фото: uploads/demo — ${demoFiles.length} файлов, uploads/r — ${rFiles.length} файлов`,
  );
  console.log(`Субботники: ${cleanups}, записей на них: ${signups}`);
  console.log(`Пользователи Telegram: ${tgUsers}`);
  console.log(`Привязки исполнителей к Telegram: ${linked} → сбросить`);

  console.log('\n── ОСТАНЕТСЯ ──');
  console.log(`Зоны: ${zones} (индексы станут 100)`);
  console.log(`Исполнители: ${executors} (без привязки, коды /link сохраняются)`);
  console.log(`Админы: ${admins.map((a) => `${a.email} (${a.role})`).join(', ')}`);
  console.log('\nНумерация: следующий репорт получит ТК-0001.');

  if (!confirm) {
    console.log('\nЧтобы выполнить: npm run db:clean -- --yes');
    return;
  }

  await prisma.$transaction([
    prisma.report.deleteMany({ where: { parentId: { not: null } } }), // сначала дубликаты
    prisma.report.deleteMany({}), // события удаляются каскадом
    prisma.cleanup.deleteMany({}), // записи на субботники — каскадом
    prisma.executor.updateMany({ data: { tgUserId: null } }),
    prisma.tgUser.deleteMany({}),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "Report_id_seq" RESTART WITH 1'),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "ReportEvent_id_seq" RESTART WITH 1'),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "Cleanup_id_seq" RESTART WITH 1'),
    prisma.$executeRawUnsafe('ALTER SEQUENCE "TgUser_id_seq" RESTART WITH 1'),
    prisma.zone.updateMany({ data: { cleanIndex: 100, indexUpdatedAt: new Date() } }),
  ]);
  await rm(join(uploadsRoot, 'demo'), { recursive: true, force: true });
  for (const f of rFiles) await rm(join(uploadsRoot, 'r', f), { force: true });

  const idx = await prisma.zone.findMany({ select: { cleanIndex: true } });
  console.log(
    `\n✔ Готово: репортов ${await prisma.report.count()}, субботников ${await prisma.cleanup.count()}, ` +
      `пользователей Telegram ${await prisma.tgUser.count()}, ` +
      `индексы зон: ${[...new Set(idx.map((z) => z.cleanIndex))].join(', ')}`,
  );
  console.log(
    '  Перезапустите сервер: powershell -ExecutionPolicy Bypass -File .\\start-demo.ps1 -ServerOnly',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
