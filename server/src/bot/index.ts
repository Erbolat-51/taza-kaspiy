import { createHash } from 'node:crypto';
import { Bot, session, webhookCallback, type BotConfig } from 'grammy';
import type { App } from '../app.js';
import type { Env } from '../env.js';
import { logger } from '../lib/logger.js';
import { initialSession, type BotContext } from './context.js';
import { dict } from './i18n.js';
import { langKeyboard, mainMenu } from './keyboards.js';
import {
  onCategory,
  onChangeRequest,
  onComment,
  onConfirm,
  onLocation,
  onPhoto,
  resetFlow,
  startReport,
  type FlowDeps,
} from './flow.js';
import { joinCleanup, showCleanups, showMap, showMyReports } from './menu.js';
import { registerNotifications } from './notify.js';
import { loadBotUser, setLang } from './users.js';

export const WEBHOOK_PATH = '/api/telegram/webhook';

/** Надпись кнопки меню (на любом языке) → действие. */
type MenuAction = 'report' | 'map' | 'cleanups' | 'my' | 'lang' | 'cancel';
const MENU = new Map<string, MenuAction>();
for (const t of [dict.kk, dict.ru]) {
  MENU.set(t.menuReport, 'report');
  MENU.set(t.menuMap, 'map');
  MENU.set(t.menuCleanups, 'cleanups');
  MENU.set(t.menuMy, 'my');
  MENU.set(t.menuLang, 'lang');
  MENU.set(t.btnCancel, 'cancel');
}

export function createBot(env: Env, config?: BotConfig<BotContext>) {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, config);
  const deps: FlowDeps = { token: env.TELEGRAM_BOT_TOKEN, publicUrl: env.PUBLIC_URL };

  // Бот никогда не молчит: любая ошибка → вежливое сообщение и сброс флоу
  bot.catch(async ({ error, ctx }) => {
    logger.error({ err: error, updateId: ctx.update.update_id }, 'bot: handler error');
    try {
      const lang = ctx.user?.lang ?? 'kk';
      if (ctx.session) resetFlow(ctx);
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply(dict[lang].error, { reply_markup: mainMenu(lang) });
    } catch (e) {
      logger.warn({ err: e }, 'bot: could not send error message');
    }
  });

  const pm = bot.chatType('private');
  pm.use(session({ initial: initialSession }));
  pm.use(async (ctx, next) => {
    ctx.user = await loadBotUser(ctx.from, ctx.chat.id);
    await next();
  });

  pm.command('start', async (ctx) => {
    resetFlow(ctx);
    await ctx.reply(dict[ctx.user.lang].chooseLang, { reply_markup: langKeyboard });
  });
  pm.command('lang', (ctx) =>
    ctx.reply(dict[ctx.user.lang].chooseLang, { reply_markup: langKeyboard }),
  );
  pm.command('report', (ctx) => startReport(ctx));
  pm.command('my', (ctx) => showMyReports(ctx, deps));
  pm.command('map', (ctx) => showMap(ctx, deps));
  pm.command('cancel', async (ctx) => {
    resetFlow(ctx);
    await ctx.reply(dict[ctx.user.lang].cancelled, { reply_markup: mainMenu(ctx.user.lang) });
  });

  pm.callbackQuery(/^lang:(kk|ru)$/, async (ctx) => {
    const lang = ctx.match[1] as 'kk' | 'ru';
    await setLang(ctx.from.id, ctx.user, lang);
    await ctx.answerCallbackQuery({ text: dict[lang].langSet });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const name = ctx.from.first_name || '👋';
    await ctx.reply(dict[lang].welcome(name.replace(/[<>&]/g, '')), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(lang),
    });
  });
  pm.callbackQuery(/^ok:(\d+)$/, (ctx) => onConfirm(ctx, Number(ctx.match[1]), deps));
  pm.callbackQuery(/^chg:(\d+)$/, (ctx) => onChangeRequest(ctx, Number(ctx.match[1])));
  pm.callbackQuery(/^cat:(\d+):([A-Z_]+)$/, (ctx) =>
    onCategory(ctx, Number(ctx.match[1]), ctx.match[2]!, deps),
  );
  pm.callbackQuery(/^join:(\d+)$/, (ctx) => joinCleanup(ctx, Number(ctx.match[1])));
  pm.on('callback_query:data', (ctx) => ctx.answerCallbackQuery());

  pm.on('message:photo', (ctx) => {
    const best = ctx.message.photo.at(-1)!;
    return onPhoto(ctx, best.file_id, best.file_size, deps);
  });
  pm.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc.mime_type?.startsWith('image/')) {
      await ctx.reply(dict[ctx.user.lang].notImage);
      return;
    }
    await onPhoto(ctx, doc.file_id, doc.file_size, deps);
  });
  pm.on('message:location', (ctx) =>
    onLocation(ctx, ctx.message.location.latitude, ctx.message.location.longitude, deps),
  );

  pm.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const lang = ctx.user.lang;
    const t = dict[lang];
    const action = MENU.get(text);

    if (action === 'cancel') {
      resetFlow(ctx);
      return ctx.reply(t.cancelled, { reply_markup: mainMenu(lang) });
    }
    if (ctx.session.step === 'comment' && !action) return onComment(ctx, text, deps);
    if (ctx.session.step === 'processing') return;

    switch (action) {
      case 'report':
        return startReport(ctx);
      case 'map':
        return showMap(ctx, deps);
      case 'cleanups':
        return showCleanups(ctx);
      case 'my':
        return showMyReports(ctx, deps);
      case 'lang':
        return ctx.reply(t.chooseLang, { reply_markup: langKeyboard });
    }
    if (ctx.session.step === 'photo') return ctx.reply(t.askPhoto);
    if (ctx.session.step === 'location') return ctx.reply(t.needLocation);
    return ctx.reply(t.unknown, { reply_markup: mainMenu(lang) });
  });

  pm.on('message', (ctx) =>
    ctx.reply(dict[ctx.user.lang].unknown, { reply_markup: mainMenu(ctx.user.lang) }),
  );

  return bot;
}

async function setCommands(bot: Bot<BotContext>) {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Бастау / тілді таңдау' },
    { command: 'report', description: 'Ластануды хабарлау' },
    { command: 'my', description: 'Менің хабарламаларым' },
    { command: 'map', description: 'Карта' },
    { command: 'lang', description: 'Тіл / Язык' },
    { command: 'cancel', description: 'Болдырмау' },
  ]);
  await bot.api.setMyCommands(
    [
      { command: 'start', description: 'Начать / выбрать язык' },
      { command: 'report', description: 'Сообщить о загрязнении' },
      { command: 'my', description: 'Мои сообщения' },
      { command: 'map', description: 'Карта' },
      { command: 'lang', description: 'Тіл / Язык' },
      { command: 'cancel', description: 'Отмена' },
    ],
    { language_code: 'ru' },
  );
}

/**
 * Запуск бота в том же процессе, что и API.
 * polling — для разработки; webhook — для прода за HTTPS (Caddy).
 */
export async function startBot(env: Env, app: App) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('bot: TELEGRAM_BOT_TOKEN is empty — bot disabled');
    return null;
  }
  const bot = createBot(env);
  await bot.init();
  await setCommands(bot).catch((err) => logger.warn({ err }, 'bot: setMyCommands failed'));
  const unsubscribe = registerNotifications(bot.api);

  if (env.TELEGRAM_MODE === 'webhook') {
    // Секрет для заголовка X-Telegram-Bot-Api-Secret-Token выводим из токена — без лишней переменной
    const secretToken = createHash('sha256')
      .update(env.TELEGRAM_BOT_TOKEN)
      .digest('hex')
      .slice(0, 48);
    app.post(
      WEBHOOK_PATH,
      { config: { rateLimit: false } },
      webhookCallback(bot, 'fastify', { secretToken }),
    );
    await bot.api.setWebhook(`${env.PUBLIC_URL}${WEBHOOK_PATH}`, {
      secret_token: secretToken,
      drop_pending_updates: true,
    });
    logger.info(`bot: @${bot.botInfo.username} webhook mode`);
  } else {
    void bot.start({
      drop_pending_updates: true,
      onStart: (me) => logger.info(`bot: @${me.username} polling`),
    });
  }

  return {
    bot,
    stop: async () => {
      unsubscribe();
      if (env.TELEGRAM_MODE !== 'webhook') await bot.stop();
    },
  };
}
