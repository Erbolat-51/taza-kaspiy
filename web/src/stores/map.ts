import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { i18n } from '../i18n';
import { statusGroup, type StatusGroup } from '../lib/meta';
import type { Category, Report, Summary, Zone } from '../types';

export type StatusFilter = 'all' | Exclude<StatusGroup, 'rejected'>;
export type PeriodFilter = 7 | 30 | 90 | 0;

export interface Toast {
  id: number;
  text: string;
  reportId?: number;
  kind: 'new' | 'done';
}

/** Сколько секунд новый маркер пульсирует после появления. */
const FRESH_MS = 15_000;

export const useMapStore = defineStore('map', () => {
  const reports = ref<Report[]>([]);
  const zones = ref<Zone[]>([]);
  const summary = ref<Summary | null>(null);
  const loading = ref(true);
  const error = ref(false);
  const connected = ref(false);
  const selectedId = ref<number | null>(null);
  const fresh = reactive(new Set<number>());
  const toasts = ref<Toast[]>([]);

  const filters = reactive({
    status: 'all' as StatusFilter,
    days: 0 as PeriodFilter,
    categories: [] as Category[],
  });
  const layers = reactive({ heatmap: false, zones: true });

  /** Публичная карта: только корневые репорты (дубликаты — бейдж ×N), без отклонённых. */
  const visible = computed(() => {
    const since = filters.days ? Date.now() - filters.days * 86_400_000 : 0;
    return reports.value.filter((r) => {
      if (r.parentId !== null || r.status === 'REJECTED') return false;
      if (filters.status !== 'all' && statusGroup(r.status) !== filters.status) return false;
      if (filters.categories.length && !filters.categories.includes(r.category)) return false;
      return !since || new Date(r.createdAt).getTime() >= since;
    });
  });

  const filtersActive = computed(
    () => filters.status !== 'all' || filters.days !== 0 || filters.categories.length > 0,
  );

  function resetFilters() {
    filters.status = 'all';
    filters.days = 0;
    filters.categories = [];
  }

  function toggleCategory(c: Category) {
    const i = filters.categories.indexOf(c);
    if (i >= 0) filters.categories.splice(i, 1);
    else filters.categories.push(c);
  }

  /** Первая загрузка показывает оверлей; фоновые обновления (после переподключения) — нет. */
  async function load() {
    loading.value = reports.value.length === 0;
    error.value = false;
    try {
      const [r, z, s] = await Promise.all([api.reports(), api.zones(), api.summary()]);
      reports.value = r;
      zones.value = z;
      summary.value = s;
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  let summaryTimer: ReturnType<typeof setTimeout> | null = null;
  function refreshSummarySoon() {
    if (summaryTimer) clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => {
      api
        .summary()
        .then((s) => (summary.value = s))
        .catch(() => {});
    }, 500);
  }

  let toastId = 0;
  function pushToast(t: Omit<Toast, 'id'>) {
    const toast = { ...t, id: ++toastId };
    toasts.value = [...toasts.value.slice(-2), toast];
    setTimeout(() => dismissToast(toast.id), 6000);
  }
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }

  const zoneLabel = (r: Report) => {
    const t = i18n.global.t;
    if (!r.zone) return t('card.noZone');
    return i18n.global.locale.value === 'kk' ? r.zone.nameKk : r.zone.nameRu;
  };

  function upsert(r: Report) {
    const i = reports.value.findIndex((x) => x.id === r.id);
    if (i >= 0) reports.value.splice(i, 1, r);
    else reports.value.unshift(r);
  }

  let socket: Socket | null = null;
  function connect() {
    if (socket) return;
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    let wasConnected = false;
    socket.on('connect', () => {
      // Переподключение: пока связи не было, могли пропустить события — перечитываем
      if (wasConnected) void load();
      wasConnected = true;
      connected.value = true;
    });
    socket.on('disconnect', () => (connected.value = false));

    socket.on('report:new', ({ report }: { report: Report }) => {
      upsert(report);
      refreshSummarySoon();
      if (report.parentId !== null) return; // дубликат — родитель обновится отдельным событием
      fresh.add(report.id);
      setTimeout(() => fresh.delete(report.id), FRESH_MS);
      const t = i18n.global.t;
      pushToast({
        kind: 'new',
        reportId: report.id,
        text: t('toast.new', { cat: t(`category.${report.category}`), zone: zoneLabel(report) }),
      });
    });

    socket.on(
      'report:updated',
      ({ report, change }: { report: Report; change: { type: string; to?: string } }) => {
        upsert(report);
        refreshSummarySoon();
        if (change.type === 'status' && change.to === 'RESOLVED' && report.parentId === null) {
          pushToast({
            kind: 'done',
            reportId: report.id,
            text: i18n.global.t('toast.resolved', { code: report.code }),
          });
        }
      },
    );

    socket.on(
      'zone:updated',
      ({
        zoneId,
        cleanIndex,
        color,
      }: {
        zoneId: number;
        cleanIndex: number;
        color: Zone['color'];
      }) => {
        const z = zones.value.find((x) => x.id === zoneId);
        if (z) Object.assign(z, { cleanIndex, color });
        refreshSummarySoon();
      },
    );
  }

  return {
    reports,
    zones,
    summary,
    loading,
    error,
    connected,
    selectedId,
    fresh,
    toasts,
    filters,
    layers,
    visible,
    filtersActive,
    resetFilters,
    toggleCategory,
    load,
    connect,
    dismissToast,
    zoneLabel,
  };
});
