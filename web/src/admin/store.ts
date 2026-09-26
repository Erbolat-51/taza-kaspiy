import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { getSocket } from '../lib/socket';
import type { Report } from '../types';
import { adminApi } from './api';
import type { AdminReport, Executor } from './types';

export type Column = 'new' | 'assigned' | 'progress' | 'resolved' | 'rejected';

export const columnOf = (r: Report): Column =>
  r.status === 'NEW' || r.status === 'CONFIRMED'
    ? 'new'
    : r.status === 'ASSIGNED'
      ? 'assigned'
      : r.status === 'IN_PROGRESS'
        ? 'progress'
        : r.status === 'RESOLVED'
          ? 'resolved'
          : 'rejected';

export interface Notice {
  id: number;
  text: string;
  kind: 'ok' | 'error' | 'info';
}

/**
 * Стор админки: список репортов живёт по Socket.IO — изменения из бота, от исполнителей
 * и из других открытых админок появляются без перезагрузки.
 */
export const useAdmin = defineStore('admin', () => {
  const reports = ref<AdminReport[]>([]);
  const executors = ref<Executor[]>([]);
  const loading = ref(false);
  const selectedId = ref<number | null>(null);
  const fresh = reactive(new Set<number>());
  const notices = ref<Notice[]>([]);
  /** Счётчик изменений — дашборд перечитывает агрегаты, когда он растёт. */
  const version = ref(0);

  async function load() {
    loading.value = true;
    try {
      const [r, e] = await Promise.all([adminApi.reports(), adminApi.executors()]);
      reports.value = r;
      executors.value = e;
    } finally {
      loading.value = false;
    }
  }

  async function reloadExecutors() {
    executors.value = await adminApi.executors();
  }

  /** Сокет присылает публичную версию — сохраняем уже загруженные админские поля (aiRaw, автор). */
  function upsert(r: Report) {
    if (r.parentId !== null) return; // дубликаты живут внутри родителя
    const i = reports.value.findIndex((x) => x.id === r.id);
    if (i >= 0) reports.value.splice(i, 1, { ...reports.value[i]!, ...r });
    else reports.value.unshift(r);
  }

  let noticeId = 0;
  function notify(text: string, kind: Notice['kind'] = 'ok') {
    const n = { id: ++noticeId, text, kind };
    notices.value = [...notices.value.slice(-2), n];
    setTimeout(() => (notices.value = notices.value.filter((x) => x.id !== n.id)), 5000);
  }

  let subscribed = false;
  function subscribe() {
    if (subscribed) return;
    subscribed = true;
    const socket = getSocket();
    socket.on('report:new', ({ report }: { report: Report }) => {
      upsert(report);
      version.value++;
      if (report.parentId !== null) return;
      fresh.add(report.id);
      setTimeout(() => fresh.delete(report.id), 20_000);
    });
    socket.on('report:updated', ({ report }: { report: Report }) => {
      upsert(report);
      version.value++;
      if (report.executorId) void reloadExecutors().catch(() => {});
    });
    socket.on('zone:updated', () => version.value++);
    // Исполнитель привязал Telegram (/link) — обновить статус «📱» в списке
    socket.on('executor:updated', () => void reloadExecutors().catch(() => {}));
    socket.on('connect', () => {
      // Переподключились — могли пропустить события
      if (reports.value.length) void load();
    });
  }

  return {
    reports,
    executors,
    loading,
    selectedId,
    fresh,
    notices,
    version,
    load,
    upsert,
    notify,
    subscribe,
  };
});
