/**
 * Симулятор бота без телефона: npm run bot:sim [фото.jpg]
 * Полный цикл демо: житель сообщил → акимат назначил → исполнитель получил задачу в Telegram,
 * начал, закрыл фото «после» → житель получил «до/после». Затем субботник: рассылка и запись.
 * Исходящие вызовы Telegram API перехватываются и печатаются; БД — настоящая.
 * Привязку исполнителя симулятор восстанавливает в конце, чтобы не отобрать её у реального аккаунта.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { Update } from 'grammy/types';
import { loadEnv } from '../src/env.js';
import { createBot } from '../src/bot/index.js';
import { registerNotifications } from '../src/bot/notify.js';
import { registerTaskNotifications } from '../src/bot/executor.js';
import { registerCleanupBroadcast } from '../src/bot/cleanups.js';
import { dict } from '../src/bot/i18n.js';
import { configureUploads } from '../src/services/photos.js';
import { assignExecutor } from '../src/services/reports.js';
import { bus } from '../src/lib/bus.js';
import { prisma } from '../src/db.js';
import { stopClip } from '../src/ai/clip.js';

const env = loadEnv({
  ...process.env,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'sim',
});
configureUploads(resolve(env.UPLOADS_DIR));

const before = process.argv[2]
  ? await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2]))
  : await sharp({ create: { width: 800, height: 600, channels: 3, background: '#d9c49a' } })
      .jpeg()
      .toBuffer();
const after = await sharp({
  create: { width: 800, height: 600, channels: 3, background: '#e9dcc0' },
})
  .jpeg()
  .toBuffer();

// «Скачивание» Telegram-файлов: file_id → содержимое
const files: Record<string, Buffer> = { before, after };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = url.match(/api\.telegram\.org\/file\/[^/]+\/sim\/(\w+)/);
  if (m) return new Response(new Uint8Array(files[m[1]!]!));
  return realFetch(input, init);
}) as typeof fetch;

const RESIDENT = 990_000_001;
const EXECUTOR = 990_000_002;
const WHO: Record<number, string> = { [RESIDENT]: 'Тұрғын', [EXECUTOR]: 'Орындаушы' };
const person = (id: number) => ({
  chat: { id, type: 'private' as const, first_name: WHO[id]! },
  from: { id, is_bot: false, first_name: WHO[id]!, language_code: 'kk' },
});

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

type Btn = { text: string; style?: string; callback_data?: string };
type Markup = { inline_keyboard?: Btn[][]; keyboard?: { text: string }[][] } | undefined;
const shown = (p: Record<string, unknown>) => {
  const text = String(p.text ?? p.caption ?? '');
  const kb = p.reply_markup as Markup;
  const lines = [text.replace(/<[^>]+>/g, '')];
  if (kb?.inline_keyboard) {
    const btns = kb.inline_keyboard.map((row) =>
      row.map((b) => `(${b.text}${b.style ? ` ·${b.style}` : ''})`).join(' '),
    );
    lines.push('   [inline] ' + btns.join(' / '));
  }
  if (kb?.keyboard) {
    lines.push('   [menu] ' + kb.keyboard.map((r) => r.map((b) => b.text).join(' | ')).join(' / '));
  }
  return lines.filter(Boolean).join('\n');
};

let msgId = 100;
/** Последние inline-кнопки, которые бот показал каждому чату — «нажимаем» их дальше. */
const lastButtons = new Map<number, Btn[]>();

bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as Record<string, unknown>;
  const chatId = Number(p.chat_id ?? 0);
  const who = WHO[chatId] ? `→ ${WHO[chatId]}:` : chatId ? `→ chat ${chatId}:` : '';
  if (['sendMessage', 'sendPhoto', 'editMessageText', 'editMessageReplyMarkup'].includes(method)) {
    const kind = method === 'sendMessage' ? '' : `[${method}] `;
    const body = shown(p);
    if (body) console.log(`🤖 ${who} ${kind}${body.replace(/\n/g, '\n   ')}`);
    const kb = p.reply_markup as Markup;
    if (kb?.inline_keyboard && chatId) lastButtons.set(chatId, kb.inline_keyboard.flat());
  } else if (method === 'answerCallbackQuery' && p.text) {
    console.log(`🤖 (toast) ${p.text}`);
  } else if (method === 'sendLocation') {
    console.log(`🤖 ${who} [sendLocation] 📍 ${p.latitude}, ${p.longitude}`);
  } else if (method === 'sendMediaGroup') {
    const media = p.media as { caption?: string }[];
    console.log(`🤖 ${who} [sendMediaGroup] ${media.map((m) => `📷 ${m.caption}`).join('  ')}`);
  }
  const result =
    method === 'getFile'
      ? { file_id: 'x', file_unique_id: 'x', file_path: `sim/${String(p.file_id)}` }
      : method === 'sendMediaGroup'
        ? []
        : method.startsWith('send') || method.startsWith('edit')
          ? { message_id: ++msgId, date: 0, chat: { id: chatId }, text: p.text ?? '' }
          : true;
  return { ok: true, result } as never;
});

let updateId = 1;
const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms)); // асинхронные подписчики шины
async function send(userId: number, u: Record<string, unknown>, label: string) {
  console.log(`\n👤 ${WHO[userId]}: ${label}`);
  await bot.handleUpdate({ update_id: updateId++, ...u } as unknown as Update);
  await settle();
}
const msg = (userId: number, extra: Record<string, unknown>) => ({
  message: {
    message_id: ++msgId,
    date: Math.floor(Date.now() / 1000),
    ...person(userId),
    ...extra,
  },
});
const cmd = (userId: number, text: string) =>
  msg(userId, {
    text,
    entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }],
  });
const photo = (userId: number, fileId: string) =>
  msg(userId, { photo: [{ file_id: fileId, file_unique_id: fileId, width: 800, height: 600 }] });
const press = (userId: number, data: string) => ({
  callback_query: {
    id: String(++msgId),
    from: person(userId).from,
    chat_instance: '1',
    data,
    message: { message_id: msgId, date: 0, chat: person(userId).chat, text: '' },
  },
});
const button = (userId: number, prefix: string) => {
  const b = lastButtons.get(userId)?.find((x) => x.callback_data?.startsWith(prefix));
  if (!b?.callback_data) throw new Error(`no ${prefix} button for ${WHO[userId]}`);
  return b as Btn & { callback_data: string };
};

const unsub = [
  registerNotifications(bot.api),
  registerTaskNotifications(bot.api),
  registerCleanupBroadcast(bot.api),
];
const utility = await prisma.executor.findFirstOrThrow({ where: { kind: 'UTILITY' } });
const originalLink = { tgUserId: utility.tgUserId, linkCode: utility.linkCode };
const t = dict.kk;
let cleanupId: number | null = null;

try {
  console.log('════════ 1. Тұрғын хабарлайды ════════');
  await send(RESIDENT, cmd(RESIDENT, '/start'), '/start');
  await send(RESIDENT, press(RESIDENT, 'lang:kk'), '🇰🇿 Қазақша');
  await send(RESIDENT, msg(RESIDENT, { text: t.menuReport }), t.menuReport);
  await send(RESIDENT, photo(RESIDENT, 'before'), '📷 фото');
  const jit = Math.random() * 0.003;
  await send(
    RESIDENT,
    msg(RESIDENT, { location: { latitude: 43.662 + jit, longitude: 51.137 - jit } }),
    '📍 геолокация',
  );
  await send(RESIDENT, msg(RESIDENT, { text: t.btnSkip }), t.btnSkip);
  const report = await prisma.report.findFirstOrThrow({
    where: { tgUser: { telegramId: BigInt(RESIDENT) } },
    orderBy: { id: 'desc' },
  });
  const ok = lastButtons.get(RESIDENT)?.find((b) => b.callback_data?.startsWith('ok:'));
  if (ok) await send(RESIDENT, press(RESIDENT, ok.callback_data!), ok.text);
  else await send(RESIDENT, press(RESIDENT, `cat:${report.id}:TRASH`), '🗑 Тұрмыстық қоқыс');

  console.log('\n════════ 2. Орындаушы ботқа байланады ════════');
  const code = utility.linkCode ?? 'SIMLNK';
  if (!utility.linkCode) {
    await prisma.executor.update({ where: { id: utility.id }, data: { linkCode: code } });
  }
  await send(EXECUTOR, cmd(EXECUTOR, `/link ${code}`), `/link ${code}`);

  console.log('\n════════ 3. Әкімдік тағайындайды (админка) ════════');
  await assignExecutor(report.id, utility.id, 'admin:sim');
  await settle(1500);

  console.log('\n════════ 4. Орындаушы жұмысты бастайды → жабады ════════');
  const start = button(EXECUTOR, 'start:');
  await send(EXECUTOR, press(EXECUTOR, start.callback_data), start.text);
  const done = button(EXECUTOR, 'done:');
  await send(EXECUTOR, press(EXECUTOR, done.callback_data), done.text);
  await send(EXECUTOR, photo(EXECUTOR, 'after'), '📷 «кейін» фотосы');
  await settle(1500);

  const final = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
  console.log(
    `\n✔ ${final.code}: status=${final.status}, afterPhoto=${final.afterPhoto ? 'бар' : 'жоқ'}`,
  );

  console.log('\n════════ 5. Сенбілік: рассылка → «Қатысамын» ════════');
  const zone = await prisma.zone.findFirstOrThrow({ where: { slug: 'city-beach' } });
  const cleanup = await prisma.cleanup.create({
    data: {
      zoneId: zone.id,
      title: '[SIM] Қалалық жағажайды тазалау',
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      meetingPoint: 'Маяк, 10:00',
      maxVolunteers: 30,
    },
  });
  cleanupId = cleanup.id;
  bus.emit('cleanup:created', { cleanupId: cleanup.id });
  await settle(2000);
  await send(RESIDENT, press(RESIDENT, `join:${cleanup.id}`), t.btnJoin);
  const signups = await prisma.cleanupSignup.count({ where: { cleanupId: cleanup.id } });
  console.log(`✔ сенбілікке жазылғандар: ${signups}`);
} finally {
  if (cleanupId) await prisma.cleanup.delete({ where: { id: cleanupId } }); // тестовый — убираем
  // Возвращаем привязку исполнителя как было (реальный аккаунт не теряет задачи)
  await prisma.executor.update({ where: { id: utility.id }, data: originalLink });
  unsub.forEach((u) => u());
  stopClip();
  await prisma.$disconnect();
}
