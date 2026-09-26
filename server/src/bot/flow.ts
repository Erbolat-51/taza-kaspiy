import type { Category, Lang } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { aiEnabled, classifyPhoto } from '../ai/classify.js';
import { CATEGORIES } from '../domain/constants.js';
import { createReport, setCategoryByUser } from '../services/reports.js';
import type { BotContext } from './context.js';
import { downloadTelegramFile } from './files.js';
import { CATEGORY_LABEL, dict, esc } from './i18n.js';
import {
  cancelKeyboard,
  categoryKeyboard,
  commentKeyboard,
  confirmKeyboard,
  locationKeyboard,
  mainMenu,
} from './keyboards.js';

const HTML = { parse_mode: 'HTML' as const };
export const LOW_CONFIDENCE = 0.6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Грубая рамка Мангистауской области — отсекаем случайные точки из других регионов. */
const inMangystau = (lat: number, lng: number) =>
  lat >= 41 && lat <= 46.5 && lng >= 49.5 && lng <= 56.5;

export interface FlowDeps {
  token: string;
  publicUrl: string;
}

export const reportLink = (publicUrl: string, id: number) => `${publicUrl}/?r=${id}`;

export const zoneName = (zone: { nameKk: string; nameRu: string } | null, lang: Lang) =>
  zone ? (lang === 'kk' ? zone.nameKk : zone.nameRu) : null;

export function resetFlow(ctx: BotContext) {
  ctx.session.step = 'idle';
  ctx.session.draft = {};
}

export async function startReport(ctx: BotContext) {
  resetFlow(ctx);
  ctx.session.step = 'photo';
  await ctx.reply(dict[ctx.user.lang].askPhoto, { reply_markup: cancelKeyboard(ctx.user.lang) });
}

/** Фото можно прислать в любой момент — это тоже старт флоу. */
export async function onPhoto(
  ctx: BotContext,
  fileId: string,
  size: number | undefined,
  deps: FlowDeps,
) {
  const t = dict[ctx.user.lang];
  if (ctx.session.step === 'processing') return;
  if (size && size > MAX_FILE_BYTES) {
    await ctx.reply(t.tooBig);
    return;
  }
  // Новый флоу: брошенный ранее черновик (старая точка) не подхватываем
  if (ctx.session.step === 'idle') ctx.session.draft = {};
  const { draft } = ctx.session;
  draft.fileId = fileId;
  // Повторное фото после «не видно загрязнения» — место и комментарий уже есть
  if (draft.lat !== undefined && draft.lng !== undefined && draft.comment !== undefined) {
    await processDraft(ctx, deps);
    return;
  }
  if (draft.lat !== undefined) {
    ctx.session.step = 'comment';
    await ctx.reply(t.askComment, { reply_markup: commentKeyboard(ctx.user.lang) });
    return;
  }
  ctx.session.step = 'location';
  await ctx.reply(t.askLocation, { reply_markup: locationKeyboard(ctx.user.lang) });
}

export async function onLocation(ctx: BotContext, lat: number, lng: number, deps: FlowDeps) {
  const t = dict[ctx.user.lang];
  if (ctx.session.step === 'processing') return;
  if (!inMangystau(lat, lng)) {
    await ctx.reply(t.outsideRegion, { reply_markup: locationKeyboard(ctx.user.lang) });
    return;
  }
  if (ctx.session.step === 'idle') ctx.session.draft = {};
  const { draft } = ctx.session;
  draft.lat = lat;
  draft.lng = lng;
  if (!draft.fileId) {
    // Сначала прислали точку — теперь попросим фото
    ctx.session.step = 'photo';
    await ctx.reply(t.askPhoto, { reply_markup: cancelKeyboard(ctx.user.lang) });
    return;
  }
  if (draft.comment !== undefined) {
    await processDraft(ctx, deps);
    return;
  }
  ctx.session.step = 'comment';
  await ctx.reply(t.askComment, { reply_markup: commentKeyboard(ctx.user.lang) });
}

export async function onComment(ctx: BotContext, text: string, deps: FlowDeps) {
  const skip = text === dict.kk.btnSkip || text === dict.ru.btnSkip;
  ctx.session.draft.comment = skip ? '' : text.trim().slice(0, 1000);
  await processDraft(ctx, deps);
}

/** ИИ → проверка «это загрязнение?» → сохранение → результат с кнопками подтверждения. */
async function processDraft(ctx: BotContext, deps: FlowDeps) {
  const lang = ctx.user.lang;
  const t = dict[lang];
  const { fileId, lat, lng, comment } = ctx.session.draft;
  if (!fileId || lat === undefined || lng === undefined) return;
  ctx.session.step = 'processing';

  const wait = await ctx.reply(aiEnabled() ? t.analyzingAi : t.analyzing, {
    reply_markup: { remove_keyboard: true },
  });
  const dropWait = () => ctx.api.deleteMessage(wait.chat.id, wait.message_id).catch(() => {});
  await ctx.replyWithChatAction('typing').catch(() => {});

  try {
    const image = await downloadTelegramFile(ctx.api, deps.token, fileId);
    const ai = await classifyPhoto({ image, comment });

    if (!ai.isPollution) {
      await dropWait();
      ctx.session.step = 'photo';
      ctx.session.draft.fileId = undefined;
      await ctx.reply(t.notPollution, { reply_markup: cancelKeyboard(lang) });
      return;
    }

    const { report } = await createReport({
      source: 'BOT',
      lat,
      lng,
      comment: comment || null,
      image,
      tgUserId: ctx.user.id,
      actor: `tg:${ctx.user.id}`,
      classification: ai,
    });
    resetFlow(ctx);
    await dropWait();

    const zone = zoneName(report.zone, lang);
    if (ai.provider === 'mock') {
      // ИИ недоступен — не притворяемся, что «ЖИ анықтады», просим выбрать категорию
      await ctx.reply(t.mockChoose(zone ? esc(zone) : null), {
        ...HTML,
        reply_markup: categoryKeyboard(lang, report.id),
      });
      return;
    }
    const low = ai.confidence < LOW_CONFIDENCE;
    const summary = esc(lang === 'kk' ? ai.summaryKk : ai.summaryRu);
    const text =
      t.aiResult(
        CATEGORY_LABEL[report.category][lang],
        report.severity,
        summary,
        zone ? esc(zone) : null,
      ) +
      '\n\n' +
      (low ? t.lowConfidence : t.askConfirm);
    await ctx.reply(text, { ...HTML, reply_markup: confirmKeyboard(lang, report.id, low) });
  } catch (err) {
    await dropWait();
    resetFlow(ctx);
    if (err instanceof AppError && err.code === 'BAD_IMAGE') {
      await ctx.reply(t.notImage, { reply_markup: mainMenu(lang) });
      return;
    }
    throw err;
  }
}

// ───────────────────────────── колбэки подтверждения ─────────────────────────────

async function sendRegistered(ctx: BotContext, reportId: number, deps: FlowDeps) {
  const t = dict[ctx.user.lang];
  const r = await prisma.report.findUnique({
    where: { id: reportId },
    select: { code: true, parent: { select: { code: true } } },
  });
  if (!r) return;
  let text = t.registered(r.code, reportLink(deps.publicUrl, reportId));
  if (r.parent) text += '\n\n' + t.duplicateNote(r.parent.code);
  await ctx.reply(text, { ...HTML, reply_markup: mainMenu(ctx.user.lang) });
}

/** Защита от двойного нажатия: подтверждённый репорт повторно не обрабатываем. */
async function alreadyConfirmed(ctx: BotContext, reportId: number) {
  const r = await prisma.report.findUnique({
    where: { id: reportId },
    select: { tgUserId: true, categoryConfirmedByUser: true },
  });
  if (!r || r.tgUserId !== ctx.user.id || r.categoryConfirmedByUser) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    return true;
  }
  return false;
}

export async function onConfirm(ctx: BotContext, reportId: number, deps: FlowDeps) {
  if (await alreadyConfirmed(ctx, reportId)) return;
  await setCategoryByUser(reportId, ctx.user.id, null);
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await sendRegistered(ctx, reportId, deps);
}

export async function onChangeRequest(ctx: BotContext, reportId: number) {
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({ reply_markup: categoryKeyboard(ctx.user.lang, reportId) })
    .catch(() => {});
}

export async function onCategory(ctx: BotContext, reportId: number, raw: string, deps: FlowDeps) {
  if (!(CATEGORIES as readonly string[]).includes(raw)) return ctx.answerCallbackQuery();
  if (await alreadyConfirmed(ctx, reportId)) return;
  const category = raw as Category;
  const report = await setCategoryByUser(reportId, ctx.user.id, category);
  await ctx.answerCallbackQuery();
  const t = dict[ctx.user.lang];
  await ctx
    .editMessageText(
      `${t.categorySet(CATEGORY_LABEL[category][ctx.user.lang])} · ${report.severity}/5`,
      { reply_markup: undefined },
    )
    .catch(() => {});
  await sendRegistered(ctx, reportId, deps);
}

export function logFlowError(err: unknown) {
  logger.error({ err }, 'bot: flow error');
}
