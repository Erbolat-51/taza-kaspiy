import type { Category, Lang } from '@prisma/client';
import type { InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup } from 'grammy/types';
import { CATEGORIES } from '../domain/constants.js';
import { CATEGORY_LABEL, dict } from './i18n.js';

export const mainMenu = (lang: Lang): ReplyKeyboardMarkup => {
  const t = dict[lang];
  return {
    keyboard: [
      [{ text: t.menuReport }],
      [{ text: t.menuMap }, { text: t.menuCleanups }],
      [{ text: t.menuMy }, { text: t.menuLang }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
};

export const locationKeyboard = (lang: Lang): ReplyKeyboardMarkup => ({
  keyboard: [
    [{ text: dict[lang].btnSendLocation, request_location: true }],
    [{ text: dict[lang].btnCancel }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
});

export const commentKeyboard = (lang: Lang): ReplyKeyboardMarkup => ({
  keyboard: [[{ text: dict[lang].btnSkip }], [{ text: dict[lang].btnCancel }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

export const cancelKeyboard = (lang: Lang): ReplyKeyboardMarkup => ({
  keyboard: [[{ text: dict[lang].btnCancel }]],
  resize_keyboard: true,
});

export const langKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🇰🇿 Қазақша', callback_data: 'lang:kk' },
      { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
    ],
  ],
};

/** Подтверждение категории. При низкой уверенности кнопки цветные — пользователь их точно заметит. */
export const confirmKeyboard = (
  lang: Lang,
  reportId: number,
  highlight: boolean,
): InlineKeyboardMarkup => {
  const ok: InlineKeyboardButton = { text: dict[lang].btnOk, callback_data: `ok:${reportId}` };
  const change: InlineKeyboardButton = {
    text: dict[lang].btnChange,
    callback_data: `chg:${reportId}`,
  };
  if (highlight) {
    ok.style = 'success';
    change.style = 'primary';
    return { inline_keyboard: [[ok], [change]] };
  }
  return { inline_keyboard: [[ok, change]] };
};

export const categoryKeyboard = (lang: Lang, reportId: number): InlineKeyboardMarkup => {
  const buttons = CATEGORIES.map((c: Category): InlineKeyboardButton => ({
    text: CATEGORY_LABEL[c][lang],
    callback_data: `cat:${reportId}:${c}`,
  }));
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return { inline_keyboard: rows };
};
