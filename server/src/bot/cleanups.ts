import { GrammyError, type Api } from 'grammy';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';
import { logger } from '../lib/logger.js';
import { dict, esc } from './i18n.js';
import { zoneName } from './flow.js';
import { formatDate } from './menu.js';

/** Telegram ограничивает ~30 сообщений/с на бота — держимся ниже с запасом. */
const SEND_INTERVAL_MS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Новый субботник → рассылка всем жителям, которые запускали бота (подписчики).
 * Идёт в фоне: админка не ждёт окончания рассылки.
 */
export function registerCleanupBroadcast(api: Api) {
  return bus.on('cleanup:created', async ({ cleanupId }) => {
    const c = await prisma.cleanup.findUnique({
      where: { id: cleanupId },
      include: { zone: true },
    });
    if (!c) return;
    const users = await prisma.tgUser.findMany({ select: { chatId: true, lang: true } });
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      const t = dict[u.lang];
      try {
        await api.sendMessage(
          Number(u.chatId),
          t.cleanupNew(
            esc(c.title),
            formatDate(c.startsAt),
            esc(c.meetingPoint),
            esc(zoneName(c.zone, u.lang) ?? ''),
          ),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: t.btnJoin, callback_data: `join:${c.id}`, style: 'success' }],
              ],
            },
          },
        );
        sent++;
      } catch (err) {
        failed++;
        // 403 — пользователь заблокировал бота; это нормально, продолжаем
        if (!(err instanceof GrammyError && err.error_code === 403)) {
          logger.warn({ err, chatId: String(u.chatId) }, 'bot: cleanup broadcast failed');
        }
      }
      await sleep(SEND_INTERVAL_MS);
    }
    logger.info({ cleanupId, sent, failed }, 'bot: cleanup broadcast done');
  });
}
