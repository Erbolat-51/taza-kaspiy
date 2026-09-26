import { i18n } from '../i18n';
import type { Lang } from '../types';

/** «2 сағ», «3 күн» — время устранения. */
export function formatDuration(fromIso: string, toIso: string) {
  const t = i18n.global.t;
  const min = Math.max(1, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (min < 60) return t('duration.minutes', { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t('duration.hours', { n: h });
  return t('duration.days', { n: Math.round(h / 24) });
}

export const pick = <T extends { nameKk: string; nameRu: string }>(o: T, lang: Lang | string) =>
  lang === 'kk' ? o.nameKk : o.nameRu;

export const botUrl = `https://t.me/${import.meta.env.VITE_BOT_USERNAME || 'taza_kaspi_bot'}`;
