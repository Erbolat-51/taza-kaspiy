import { InputMediaBuilder, type Api } from 'grammy';
import { prisma } from '../db.js';
import { bus } from '../lib/bus.js';
import { logger } from '../lib/logger.js';
import { photoAsJpeg } from './files.js';
import { STATUS_LABEL, dict, esc } from './i18n.js';

const HTML = { parse_mode: 'HTML' as const };

/**
 * Автор репорта получает сообщение при каждой смене статуса.
 * RESOLVED — media group «до/после» (JPEG) и благодарность.
 */
export function registerNotifications(api: Api) {
  return bus.on('report:updated', async ({ report, change }) => {
    if (change.type !== 'status' || !report.tgUserId) return;
    const author = await prisma.tgUser.findUnique({ where: { id: report.tgUserId } });
    if (!author) return;
    const chatId = Number(author.chatId);
    const lang = author.lang;
    const t = dict[lang];

    try {
      if (change.to === 'RESOLVED') {
        // У дубликата фото «после» лежит у родителя
        const afterPhoto =
          report.afterPhoto ??
          (report.parentId
            ? (
                await prisma.report.findUnique({
                  where: { id: report.parentId },
                  select: { afterPhoto: true },
                })
              )?.afterPhoto
            : null);
        if (afterPhoto) {
          const [before, after] = await Promise.all([
            photoAsJpeg(report.photo),
            photoAsJpeg(afterPhoto),
          ]);
          await api.sendMediaGroup(chatId, [
            InputMediaBuilder.photo(before, { caption: `${report.code} · ${t.before}` }),
            InputMediaBuilder.photo(after, { caption: t.after }),
          ]);
        }
        await api.sendMessage(chatId, t.resolvedThanks(report.code), HTML);
        return;
      }

      const lines = [t.statusChanged(report.code, STATUS_LABEL[change.to][lang])];
      if (change.to === 'ASSIGNED' && report.executor) {
        lines.push(t.executorLine(lang === 'kk' ? report.executor.nameKk : report.executor.nameRu));
      }
      if (change.to === 'REJECTED' && report.rejectReason) {
        lines.push(t.reason(esc(report.rejectReason)));
      }
      await api.sendMessage(chatId, lines.join('\n'), HTML);
    } catch (err) {
      // Пользователь мог заблокировать бота — это не ошибка сервиса
      logger.warn({ err, reportId: report.id }, 'bot: status notification failed');
    }
  });
}
