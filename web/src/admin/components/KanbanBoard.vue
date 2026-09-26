<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { adminApi, apiError } from '../api';
import { columnOf, useAdmin, type Column } from '../store';
import type { AdminReport } from '../types';
import type { ReportStatus } from '../../types';
import { CATEGORY_EMOJI, GROUP_COLOR } from '../../lib/meta';

const props = defineProps<{ items: AdminReport[]; showRejected: boolean }>();
const store = useAdmin();
const { t, locale } = useI18n();

const COLUMNS: { key: Column; color: string; target: ReportStatus }[] = [
  { key: 'new', color: GROUP_COLOR.new, target: 'CONFIRMED' },
  { key: 'assigned', color: '#3B82F6', target: 'ASSIGNED' },
  { key: 'progress', color: GROUP_COLOR.work, target: 'IN_PROGRESS' },
  { key: 'resolved', color: GROUP_COLOR.done, target: 'RESOLVED' },
  { key: 'rejected', color: GROUP_COLOR.rejected, target: 'REJECTED' },
];
/** Убранных много — в канбане показываем последние, остальное в таблице. */
const RESOLVED_LIMIT = 30;

const columns = computed(() => {
  const by: Record<Column, AdminReport[]> = {
    new: [],
    assigned: [],
    progress: [],
    resolved: [],
    rejected: [],
  };
  for (const r of props.items) by[columnOf(r)].push(r);
  for (const list of Object.values(by)) {
    list.sort(
      (a, b) => b.severity - a.severity || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }
  by.resolved.sort((a, b) => Date.parse(b.resolvedAt ?? '') - Date.parse(a.resolvedAt ?? ''));
  return COLUMNS.filter((c) => c.key !== 'rejected' || props.showRejected).map((c) => ({
    ...c,
    all: by[c.key],
    items: c.key === 'resolved' ? by[c.key].slice(0, RESOLVED_LIMIT) : by[c.key],
  }));
});

const dragging = ref<AdminReport | null>(null);
const over = ref<Column | null>(null);

/**
 * Перетаскивание = смена статуса. Особые случаи открывают drawer:
 * «Назначены» без исполнителя (нужно выбрать кого) и «Отклонены» (нужна причина).
 */
async function drop(col: (typeof COLUMNS)[number]) {
  const r = dragging.value;
  dragging.value = null;
  over.value = null;
  if (!r || columnOf(r) === col.key) return;
  if ((col.key === 'assigned' && !r.executorId) || col.key === 'rejected') {
    if (col.key === 'assigned') store.notify(t('admin.needExecutor'), 'info');
    store.selectedId = r.id;
    return;
  }
  const target: ReportStatus = col.key === 'new' ? 'NEW' : col.target;
  const prev = { ...r };
  store.upsert({ ...r, status: target }); // оптимистично
  try {
    store.upsert(await adminApi.setStatus(r.id, target));
  } catch (e) {
    store.upsert(prev);
    store.notify(t('admin.drawer.error', { msg: apiError(e) }), 'error');
  }
}

const zoneName = (r: AdminReport) =>
  r.zone ? (locale.value === 'kk' ? r.zone.nameKk : r.zone.nameRu) : t('card.noZone');
const executorName = (r: AdminReport) =>
  r.executor ? (locale.value === 'kk' ? r.executor.nameKk : r.executor.nameRu) : null;
</script>

<template>
  <div class="flex h-full gap-3 overflow-x-auto pb-2">
    <section
      v-for="col in columns"
      :key="col.key"
      class="flex w-72 shrink-0 flex-col rounded-2xl bg-sand-2/60 transition"
      :class="over === col.key ? 'ring-2 ring-teal' : ''"
      @dragover.prevent="over = col.key"
      @dragleave="over = over === col.key ? null : over"
      @drop.prevent="drop(col)"
    >
      <header class="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 class="flex items-center gap-2 text-sm font-semibold">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ background: col.color }" />
          {{ t(`admin.columns.${col.key}`) }}
        </h2>
        <span class="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums">{{
          col.all.length
        }}</span>
      </header>

      <TransitionGroup tag="ul" name="kanban" class="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        <li
          v-for="r in col.items"
          :key="r.id"
          draggable="true"
          class="group cursor-grab rounded-xl bg-white p-2.5 shadow-sm transition hover:shadow-md active:cursor-grabbing"
          :class="[
            store.fresh.has(r.id) ? 'ring-2 ring-st-new animate-[tk-flash_1.2s_ease-in-out_3]' : '',
            dragging?.id === r.id ? 'opacity-40' : '',
          ]"
          tabindex="0"
          role="button"
          :aria-label="`${r.code} ${t(`category.${r.category}`)}`"
          @dragstart="dragging = r"
          @dragend="
            dragging = null;
            over = null;
          "
          @click="store.selectedId = r.id"
          @keydown.enter="store.selectedId = r.id"
        >
          <div class="flex gap-2.5">
            <img
              :src="r.photoThumb"
              alt=""
              class="h-14 w-14 shrink-0 rounded-lg bg-sand object-cover"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1">
                <span class="text-xs font-bold">{{ r.code }}</span>
                <span class="flex gap-0.5" :aria-label="`${r.severity}/5`">
                  <span
                    v-for="i in 5"
                    :key="i"
                    class="h-1.5 w-2.5 rounded-sm"
                    :class="
                      i <= r.severity ? (r.severity >= 4 ? 'bg-st-new' : 'bg-st-work') : 'bg-sand-2'
                    "
                  />
                </span>
              </div>
              <p class="truncate text-sm font-medium">
                {{ CATEGORY_EMOJI[r.category] }} {{ t(`category.${r.category}`) }}
              </p>
              <p class="truncate text-xs text-muted">📍 {{ zoneName(r) }}</p>
            </div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span class="truncate">{{
              executorName(r) ? '👷 ' + executorName(r) : dayjs(r.createdAt).fromNow()
            }}</span>
            <span class="flex shrink-0 items-center gap-1">
              <span
                v-if="r.duplicatesCount"
                class="rounded-full bg-caspian px-1.5 font-semibold text-white"
                >×{{ r.duplicatesCount + 1 }}</span
              >
              <span v-if="r.source === 'BOT'" title="Telegram">📱</span>
              <span
                v-if="r.aiProvider && r.aiProvider !== 'mock'"
                class="rounded bg-aqua/30 px-1 font-semibold text-teal"
                >AI</span
              >
            </span>
          </div>
        </li>
      </TransitionGroup>
      <p v-if="!col.items.length" class="px-3 pb-4 text-center text-xs text-muted">
        {{ dragging ? t('admin.dropHint') : t('admin.empty') }}
      </p>
      <p v-if="col.all.length > col.items.length" class="px-3 pb-3 text-center text-xs text-muted">
        +{{ col.all.length - col.items.length }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.kanban-move,
.kanban-enter-active,
.kanban-leave-active {
  transition: all 0.3s ease;
}
.kanban-enter-from,
.kanban-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
