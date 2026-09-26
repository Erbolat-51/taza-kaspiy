import type { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import type { Lang } from '@prisma/client';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';
import { logger } from '../lib/logger.js';
import { addAfterPhoto, changeStatus } from '../services/reports.js';
import type { BotContext } from './context.js';
import { downloadTelegramFile, photoAsJpeg } from './files.js';
import { CATEGORY_LABEL, dict, esc } from './i18n.js';
import { cancelKeyboard, menuFor } from './keyboards.js';
import { resetFlow, zoneName, type FlowDeps } from './flow.js';
import { setExecutor } from './users.js';

const HTML = { parse_mode: 'HTML' as const };

const startKb = (lang: Lang, id: number): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: dict[lang].btnStart, callback_data: `start:${id}`, style: 'primary' }],
  ],
});
const doneKb = (lang: Lang, id: number): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: dict[lang].btnDone, callback_data: `done:${id}`, style: 'success' }]],
});

const actorOf = (executorId: number) => `executor:${executorId}`;

/** /link КОД — привязка Telegram-аккаунта к исполнителю из админки. */
export async function linkExecutor(ctx: BotContext, rawCode: string) {
  const t = dict[ctx.user.lang];
  const code = rawCode.trim().toUpperCase();
  if (!code) return ctx.reply(t.linkUsage);
  const executor = await prisma.executor.findUnique({ where: { linkCode: code } });
  if (!executor) return ctx.reply(t.linkBad);

  await prisma.$transaction([
    // Один Telegram — один исполнитель: снимаем прежнюю привязку этого аккаунта, если была
    prisma.executor.updateMany({
      where: { tgUserId: ctx.user.id, NOT: { id: executor.id } },
      data: { tgUserId: null },
    }),
    prisma.executor.update({ where: { id: executor.id }, data: { tgUserId: ctx.user.id } }),
    prisma.tgUser.update({ where: { id: ctx.user.id }, data: { role: 'EXECUTOR' } }),
  ]);
  setExecutor(ctx.from!.id, ctx.user, executor.id);
  bus.emit('executor:linked', { executorId: executor.id });

  const name = ctx.user.lang === 'kk' ? executor.nameKk : executor.nameRu;
  await ctx.reply(t.linkOk(esc(name)), { ...HTML, reply_markup: menuFor(ctx) });
}

/** Проверка: репорт назначен именно этому исполнителю и ещё открыт. */
async function ownTask(ctx: BotContext, reportId: number) {
  if (!ctx.user.executorId) return null;
  const r = await prisma.report.findUnique({ where: { id: reportId } });
  if (!r || r.executorId !== ctx.user.executorId) return null;
  if (r.status !== 'ASSIGNED' && r.status !== 'IN_PROGRESS') return null;
  return r;
}

export async function onTaskStart(ctx: BotContext, reportId: number) {
  const t = dict[ctx.user.lang];
  const r = await ownTask(ctx, reportId);
  if (!r) {
    await ctx.answerCallbackQuery({ text: t.taskNotYours });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    return;
  }
  if (r.status === 'ASSIGNED')
    await changeStatus(r.id, 'IN_PROGRESS', actorOf(ctx.user.executorId!));
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: doneKb(ctx.user.lang, r.id) }).catch(() => {});
  await ctx.reply(t.taskStarted(r.code), HTML);
}

export async function onTaskDone(ctx: BotContext, reportId: number) {
  const t = dict[ctx.user.lang];
  const r = await ownTask(ctx, reportId);
  if (!r) {
    await ctx.answerCallbackQuery({ text: t.taskNotYours });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    return;
  }
  resetFlow(ctx);
  ctx.session.step = 'afterPhoto';
  ctx.session.taskId = r.id;
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply(t.askAfterPhoto(r.code), {
    ...HTML,
    reply_markup: cancelKeyboard(ctx.user.lang),
  });
}

/** Фото «после» от исполнителя → репорт RESOLVED, автор получает «до/после». */
export async function onAfterPhoto(ctx: BotContext, fileId: string, deps: FlowDeps) {
  const t = dict[ctx.user.lang];
  const id = ctx.session.taskId;
  const r = id ? await ownTask(ctx, id) : null;
  resetFlow(ctx);
  ctx.session.taskId = undefined;
  if (!r) return ctx.reply(t.taskNotYours, { reply_markup: menuFor(ctx) });

  await ctx.replyWithChatAction('upload_photo').catch(() => {});
  const image = await downloadTelegramFile(ctx.api, deps.token, fileId);
  await addAfterPhoto(r.id, image, actorOf(ctx.user.executorId!));
  await ctx.reply(t.taskClosed(r.code), { ...HTML, reply_markup: menuFor(ctx) });
}

/** Отправка задачи исполнителю: фото (JPEG) с описанием → точка на карте → кнопка «Бастадым». */
async function sendTask(api: Api, reportId: number) {
  const r = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      zone: { select: { nameKk: true, nameRu: true } },
      executor: { include: { tgUser: true } },
    },
  });
  const tg = r?.executor?.tgUser;
  if (!r || !tg) return; // исполнитель не привязан к Telegram — задача только в админке
  const lang = tg.lang;
  const t = dict[lang];
  const chatId = Number(tg.chatId);
  const caption = t.taskNew(
    r.code,
    CATEGORY_LABEL[r.category][lang],
    r.severity,
    esc(zoneName(r.zone, lang) ?? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`),
    esc((lang === 'kk' ? r.aiSummaryKk : r.aiSummaryRu) ?? ''),
    r.comment ? esc(r.comment.slice(0, 300)) : null,
  );
  await api.sendPhoto(chatId, await photoAsJpeg(r.photo), { caption, ...HTML });
  await api.sendLocation(chatId, r.lat, r.lng);
  await api.sendMessage(chatId, t.taskGo, { reply_markup: startKb(lang, r.id) });
}

async function notifyReassigned(api: Api, reportId: number, previousExecutorId: number) {
  const ex = await prisma.executor.findUnique({
    where: { id: previousExecutorId },
    include: { tgUser: true },
  });
  const r = await prisma.report.findUnique({ where: { id: reportId }, select: { code: true } });
  if (!ex?.tgUser || !r) return;
  await api.sendMessage(Number(ex.tgUser.chatId), dict[ex.tgUser.lang].taskReassigned(r.code));
}

export function registerTaskNotifications(api: Api) {
  return bus.on('report:updated', async ({ report, change }) => {
    if (change.type !== 'assigned') return;
    const prev = change.previousExecutorId;
    try {
      if (prev && prev !== change.executorId) await notifyReassigned(api, report.id, prev);
      await sendTask(api, report.id);
    } catch (err) {
      logger.warn({ err, reportId: report.id }, 'bot: task notification failed');
    }
  });
}

export async function showTasks(ctx: BotContext) {
  const lang = ctx.user.lang;
  const t = dict[lang];
  const tasks = ctx.user.executorId
    ? await prisma.report.findMany({
        where: { executorId: ctx.user.executorId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        include: { zone: { select: { nameKk: true, nameRu: true } } },
        orderBy: [{ severity: 'desc' }, { assignedAt: 'asc' }],
        take: 10,
      })
    : [];
  if (!tasks.length) return ctx.reply(t.tasksEmpty, { reply_markup: menuFor(ctx) });
  await ctx.reply(t.tasksTitle, { ...HTML, reply_markup: menuFor(ctx) });
  for (const r of tasks) {
    await ctx.reply(
      `<b>${r.code}</b> · ${CATEGORY_LABEL[r.category][lang]} · ${r.severity}/5\n📍 ${esc(zoneName(r.zone, lang) ?? '—')}`,
      {
        ...HTML,
        reply_markup: r.status === 'ASSIGNED' ? startKb(lang, r.id) : doneKb(lang, r.id),
      },
    );
  }
}
