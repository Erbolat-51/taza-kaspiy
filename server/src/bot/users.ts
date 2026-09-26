import type { Lang } from '@prisma/client';
import type { User } from 'grammy/types';
import { prisma } from '../db.js';
import type { BotUser } from './context.js';

/** Кэш пользователей бота: не ходим в БД на каждый апдейт. */
const cache = new Map<number, BotUser>();

export async function loadBotUser(from: User, chatId: number): Promise<BotUser> {
  const cached = cache.get(from.id);
  if (cached) return cached;
  const row = await prisma.tgUser.upsert({
    where: { telegramId: BigInt(from.id) },
    create: {
      telegramId: BigInt(from.id),
      chatId: BigInt(chatId),
      username: from.username ?? null,
      firstName: from.first_name,
      lang: from.language_code === 'ru' ? 'ru' : 'kk',
    },
    update: { chatId: BigInt(chatId), username: from.username ?? null, firstName: from.first_name },
    include: { executor: { select: { id: true } } },
  });
  const user: BotUser = {
    id: row.id,
    lang: row.lang,
    firstName: row.firstName,
    executorId: row.executor?.id ?? null,
  };
  cache.set(from.id, user);
  return user;
}

export async function setLang(telegramId: number, user: BotUser, lang: Lang) {
  await prisma.tgUser.update({ where: { id: user.id }, data: { lang } });
  user.lang = lang;
  cache.set(telegramId, user);
}

export function setExecutor(telegramId: number, user: BotUser, executorId: number) {
  user.executorId = executorId;
  cache.set(telegramId, user);
}
