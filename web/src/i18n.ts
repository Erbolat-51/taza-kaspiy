import { createI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/kk';
import 'dayjs/locale/ru';
import kk from './locales/kk';
import ru from './locales/ru';
import type { Lang } from './types';

dayjs.extend(relativeTime);

const saved = (() => {
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
})();
const initial: Lang = saved === 'ru' ? 'ru' : 'kk'; // казахский по умолчанию

export const i18n = createI18n({
  legacy: false,
  locale: initial,
  fallbackLocale: 'ru',
  messages: { kk, ru },
});

dayjs.locale(initial);
document.documentElement.lang = initial;

export function setLang(lang: Lang) {
  i18n.global.locale.value = lang;
  dayjs.locale(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* приватный режим — не критично */
  }
}
