import { prisma } from '../db.js';
import type { BotContext } from './context.js';
import { CATEGORY_LABEL, STATUS_LABEL, dict, esc } from './i18n.js';
import { mainMenu } from './keyboards.js';
import { reportLink, zoneName, type FlowDeps } from './flow.js';

const HTML = { parse_mode: 'HTML' as const };

/** Время Актау (UTC+5) для всех дат в боте. */
const fmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Aqtau',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
export const formatDate = (d: Date) => fmt.format(d).replace(',', '');

/** Telegram не принимает http://localhost в URL-кнопках — тогда даём ссылку текстом. */
const isHttps = (url: string) => url.startsWith('https://');

export async function showMap(ctx: BotContext, deps: FlowDeps) {
  const t = dict[ctx.user.lang];
  if (isHttps(deps.publicUrl)) {
    await ctx.reply(t.mapText(deps.publicUrl), {
      reply_markup: { inline_keyboard: [[{ text: t.btnOpenMap, url: deps.publicUrl }]] },
    });
  } else {
    await ctx.reply(t.mapText(deps.publicUrl), { reply_markup: mainMenu(ctx.user.lang) });
  }
}

export async function showMyReports(ctx: BotContext, deps: FlowDeps) {
  const lang = ctx.user.lang;
  const t = dict[lang];
  const reports = await prisma.report.findMany({
    where: { tgUserId: ctx.user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { zone: { select: { nameKk: true, nameRu: true } } },
  });
  if (reports.length === 0) {
    await ctx.reply(t.myEmpty, { reply_markup: mainMenu(lang) });
    return;
  }
  const lines = reports.map((r) => {
    const zone = zoneName(r.zone, lang);
    return [
      `<a href="${reportLink(deps.publicUrl, r.id)}"><b>${r.code}</b></a> · ${CATEGORY_LABEL[r.category][lang]}`,
      `${STATUS_LABEL[r.status][lang]} · ${formatDate(r.createdAt)}`,
      zone ? `📍 ${esc(zone)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });
  await ctx.reply(`${t.myTitle}\n\n${lines.join('\n\n')}`, {
    ...HTML,
    link_preview_options: { is_disabled: true },
    reply_markup: mainMenu(lang),
  });
}

export async function showCleanups(ctx: BotContext) {
  const lang = ctx.user.lang;
  const t = dict[lang];
  const cleanups = await prisma.cleanup.findMany({
    where: { status: 'PLANNED', startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 5,
    include: { zone: true, _count: { select: { signups: true } } },
  });
  if (cleanups.length === 0) {
    await ctx.reply(t.cleanupsEmpty, { reply_markup: mainMenu(lang) });
    return;
  }
  await ctx.reply(t.cleanupsTitle, { ...HTML, reply_markup: mainMenu(lang) });
  for (const c of cleanups) {
    await ctx.reply(
      t.cleanupLine(
        esc(c.title),
        formatDate(c.startsAt),
        esc(c.meetingPoint),
        esc(zoneName(c.zone, lang) ?? ''),
        c._count.signups,
        c.maxVolunteers,
      ),
      {
        ...HTML,
        reply_markup: { inline_keyboard: [[{ text: t.btnJoin, callback_data: `join:${c.id}` }]] },
      },
    );
  }
}

export async function joinCleanup(ctx: BotContext, cleanupId: number) {
  const t = dict[ctx.user.lang];
  const c = await prisma.cleanup.findUnique({
    where: { id: cleanupId },
    include: { _count: { select: { signups: true } } },
  });
  if (!c || c.status !== 'PLANNED') return ctx.answerCallbackQuery();
  const exists = await prisma.cleanupSignup.findUnique({
    where: { cleanupId_tgUserId: { cleanupId, tgUserId: ctx.user.id } },
  });
  if (exists) return ctx.answerCallbackQuery({ text: t.alreadyJoined });
  if (c._count.signups >= c.maxVolunteers) return ctx.answerCallbackQuery({ text: t.cleanupFull });
  await prisma.cleanupSignup.create({ data: { cleanupId, tgUserId: ctx.user.id } });
  await ctx.answerCallbackQuery({ text: t.joined });
}
