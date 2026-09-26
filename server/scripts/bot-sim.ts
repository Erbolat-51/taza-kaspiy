/**
 * Симулятор бота без телефона: npm run bot:sim [фото.jpg]
 * Прогоняет через бота настоящие апдейты (/start → язык → фото → точка → комментарий → категория),
 * перехватывает исходящие вызовы Telegram API и печатает диалог. Пишет в настоящую БД.
 * Затем назначает исполнителя и закрывает репорт фото «после» — чтобы проверить уведомления автору.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { Update } from 'grammy/types';
import { loadEnv } from '../src/env.js';
import { createBot } from '../src/bot/index.js';
import { registerNotifications } from '../src/bot/notify.js';
import { dict } from '../src/bot/i18n.js';
import { configureUploads } from '../src/services/photos.js';
import { addAfterPhoto, assignExecutor, changeStatus } from '../src/services/reports.js';
import { prisma } from '../src/db.js';

const env = loadEnv({
  ...process.env,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'sim',
});
configureUploads(resolve(env.UPLOADS_DIR));

const photoArg = process.argv[2];
const photo = photoArg
  ? await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), photoArg))
  : await sharp({ create: { width: 800, height: 600, channels: 3, background: '#d9c49a' } })
      .jpeg()
      .toBuffer();

// Telegram-файлы «скачиваются» из памяти
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('api.telegram.org/file/')) return new Response(new Uint8Array(photo));
  return realFetch(input, init);
}) as typeof fetch;

const USER_ID = 990_000_001;
const chat = { id: USER_ID, type: 'private' as const, first_name: 'Демо' };
const from = { id: USER_ID, is_bot: false, first_name: 'Демо', language_code: 'kk' };

const bot = createBot(env, {
  botInfo: {
    id: 1,
    is_bot: true,
    first_name: 'Taza Kaspiy',
    username: 'taza_sim_bot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  } as never,
});

let msgId = 100;
const shown = (p: Record<string, unknown>) => {
  const text = (p.text ?? p.caption ?? '') as string;
  const kb = p.reply_markup as
    | {
        inline_keyboard?: { text: string; style?: string; callback_data?: string }[][];
        keyboard?: { text: string }[][];
        remove_keyboard?: boolean;
      }
    | undefined;
  const lines = [text.replace(/<[^>]+>/g, '')];
  if (kb?.inline_keyboard)
    lines.push(
      '   [inline] ' +
        kb.inline_keyboard
          .map((row) => row.map((b) => `(${b.text}${b.style ? ` ·${b.style}` : ''})`).join(' '))
          .join(' / '),
    );
  if (kb?.keyboard)
    lines.push('   [menu] ' + kb.keyboard.map((r) => r.map((b) => b.text).join(' | ')).join(' / '));
  return lines.filter(Boolean).join('\n');
};

bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as Record<string, unknown>;
  if (
    ['sendMessage', 'editMessageText', 'editMessageReplyMarkup', 'answerCallbackQuery'].includes(
      method,
    )
  ) {
    const body = method === 'answerCallbackQuery' ? (p.text ? `(toast) ${p.text}` : '') : shown(p);
    if (body)
      console.log(
        `🤖 ${method === 'sendMessage' ? '' : `[${method}] `}${body.replace(/\n/g, '\n   ')}`,
      );
  } else if (method === 'sendMediaGroup') {
    const media = p.media as { caption?: string }[];
    console.log(`🤖 [sendMediaGroup] ${media.map((m) => `📷 ${m.caption}`).join('  ')}  (JPEG)`);
  }
  const result =
    method === 'getFile'
      ? { file_id: 'x', file_unique_id: 'x', file_path: 'photos/sim.jpg' }
      : method === 'sendMediaGroup'
        ? []
        : method.startsWith('send') || method.startsWith('edit')
          ? { message_id: ++msgId, date: 0, chat, text: p.text ?? '' }
          : true;
  return { ok: true, result } as never;
});

let updateId = 1;
const send = async (u: Omit<Update, 'update_id'>, label: string) => {
  console.log(`\n👤 ${label}`);
  await bot.handleUpdate({ update_id: updateId++, ...u } as Update);
};
const msg = (extra: Record<string, unknown>) => ({
  message: { message_id: ++msgId, date: Math.floor(Date.now() / 1000), chat, from, ...extra },
});
const cb = (data: string) => ({
  callback_query: {
    id: String(++msgId),
    from,
    chat_instance: '1',
    data,
    message: { message_id: msgId, date: 0, chat, text: '' },
  },
});

const t = dict.kk;
await send(
  msg({ text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] }),
  '/start',
);
await send(cb('lang:kk'), '🇰🇿 Қазақша');
await send(msg({ text: t.menuReport }), t.menuReport);
await send(
  msg({ photo: [{ file_id: 'p1', file_unique_id: 'p1', width: 800, height: 600 }] }),
  '📷 (фото)',
);
await send(msg({ location: { latitude: 43.662, longitude: 51.137 } }), '📍 43.662, 51.137');
await send(msg({ text: 'Жағада пластик бөтелкелер' }), '💬 Жағада пластик бөтелкелер');

const report = await prisma.report.findFirst({
  where: { tgUser: { telegramId: BigInt(USER_ID) } },
  orderBy: { id: 'desc' },
});
if (!report) throw new Error('report not created');

// Путь: для mock — выбор категории, для Claude — подтверждение
const provider = (report.aiRaw as { provider?: string }).provider;
if (provider === 'mock') await send(cb(`cat:${report.id}:PLASTIC`), '🧴 Пластик қоқыс');
else await send(cb(`ok:${report.id}`), '✅ Дұрыс');
await send(cb(`ok:${report.id}`), '✅ (повторное нажатие — должно игнорироваться)');
await send(msg({ text: t.menuMy }), t.menuMy);

console.log('\n──────── акимат меняет статус → уведомления автору ────────');
const unsubscribe = registerNotifications(bot.api);
const executor = await prisma.executor.findFirstOrThrow({ where: { kind: 'UTILITY' } });
await assignExecutor(report.id, executor.id, 'admin:sim');
await changeStatus(report.id, 'IN_PROGRESS', 'admin:sim');
const after = await sharp({
  create: { width: 800, height: 600, channels: 3, background: '#e9dcc0' },
})
  .jpeg()
  .toBuffer();
await addAfterPhoto(report.id, after, 'admin:sim');
await new Promise((r) => setTimeout(r, 1500)); // уведомления асинхронные
unsubscribe();
await prisma.$disconnect();
