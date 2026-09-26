<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { api } from '../api';
import { useMapStore } from '../stores/map';
import { CATEGORY_EMOJI, GROUP_COLOR, statusGroup } from '../lib/meta';
import { formatDuration } from '../lib/format';
import type { ReportDetails, ReportEvent } from '../types';
import BeforeAfter from './BeforeAfter.vue';

const store = useMapStore();
const { t, locale } = useI18n();

const details = ref<ReportDetails | null>(null);
const loading = ref(false);
const notFound = ref(false);

/** Версия репорта из стора — меняется по сокету, тогда перечитываем детали (история). */
const live = computed(() => store.reports.find((r) => r.id === store.selectedId) ?? null);

async function fetchDetails(id: number) {
  loading.value = !details.value || details.value.id !== id;
  notFound.value = false;
  try {
    details.value = await api.report(id);
  } catch {
    notFound.value = true;
    details.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => store.selectedId,
  (id) => {
    if (id === null) details.value = null;
    else void fetchDetails(id);
  },
  { immediate: true },
);
watch(
  () =>
    live.value &&
    `${live.value.status}|${live.value.afterPhoto}|${live.value.duplicatesCount}|${live.value.category}`,
  (now, before) => {
    if (before && now && store.selectedId !== null) void fetchDetails(store.selectedId);
  },
);

const r = computed(() => details.value);
const group = computed(() => (r.value ? statusGroup(r.value.status) : 'new'));
const summary = computed(() =>
  r.value ? (locale.value === 'kk' ? r.value.aiSummaryKk : r.value.aiSummaryRu) : null,
);
const zoneName = computed(() =>
  r.value?.zone
    ? locale.value === 'kk'
      ? r.value.zone.nameKk
      : r.value.zone.nameRu
    : t('card.noZone'),
);

function eventText(e: ReportEvent) {
  const p = e.payload as Record<string, string | boolean | undefined>;
  switch (e.type) {
    case 'AI_CLASSIFIED':
      return t('event.AI_CLASSIFIED', { cat: t(`category.${p.category}`) });
    case 'STATUS_CHANGED':
      return t('event.STATUS_CHANGED', { status: t(`status.${p.to}`) });
    case 'ASSIGNED':
      return t('event.ASSIGNED', {
        name: (locale.value === 'kk' ? p.executorNameKk : p.executorNameRu) ?? '',
      });
    case 'COMMENT':
      if (p.kind === 'category') {
        return p.confirmed
          ? t('event.CATEGORY_OK')
          : t('event.CATEGORY', { cat: t(`category.${p.to}`) });
      }
      return t('event.COMMENT');
    default:
      return t(`event.${e.type}`);
  }
}

const eventDot: Record<string, string> = {
  CREATED: GROUP_COLOR.new,
  AI_CLASSIFIED: '#5FD1C1',
  ASSIGNED: GROUP_COLOR.work,
  AFTER_PHOTO: GROUP_COLOR.done,
};
const dotColor = (e: ReportEvent) =>
  e.type === 'STATUS_CHANGED'
    ? GROUP_COLOR[statusGroup((e.payload as { to: ReportDetails['status'] }).to)]
    : (eventDot[e.type] ?? '#8A96A3');

function close() {
  store.selectedId = null;
}
</script>

<template>
  <section
    class="card pointer-events-auto flex max-h-full w-full flex-col overflow-hidden md:w-[400px]"
    role="dialog"
    :aria-label="r?.code ?? ''"
    @keydown.esc="close"
  >
    <header class="flex items-center justify-between gap-2 border-b border-sand-2 px-4 py-3">
      <div v-if="r" class="flex items-center gap-2">
        <span class="font-display text-lg font-bold">{{ r.code }}</span>
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
          :style="{ background: GROUP_COLOR[group] }"
        >
          {{ t(`status.${r.status}`) }}
        </span>
      </div>
      <span v-else class="text-sm text-muted">{{ loading ? t('app.loading') : '' }}</span>
      <button
        type="button"
        class="grid h-8 w-8 place-items-center rounded-full text-xl text-muted hover:bg-sand hover:text-caspian"
        :aria-label="t('card.close')"
        @click="close"
      >
        ×
      </button>
    </header>

    <div v-if="notFound" class="p-6 text-center text-sm text-muted">{{ t('card.notFound') }}</div>

    <div v-else-if="r" class="flex-1 space-y-4 overflow-y-auto p-4">
      <!-- Фото -->
      <BeforeAfter v-if="r.afterPhoto" :before="r.photo" :after="r.afterPhoto" />
      <a v-else :href="r.photo" target="_blank" rel="noopener" class="block">
        <img
          :src="r.photo"
          :alt="t(`category.${r.category}`)"
          class="aspect-[4/3] w-full rounded-xl bg-sand-2 object-cover"
        />
      </a>

      <!-- Категория и опасность -->
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="font-display text-base font-bold">
            <span aria-hidden="true">{{ CATEGORY_EMOJI[r.category] }}</span>
            {{ t(`category.${r.category}`) }}
          </p>
          <p class="text-sm text-muted">📍 {{ zoneName }}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-muted">{{ t('card.severity') }}</p>
          <div class="mt-1 flex gap-0.5" :aria-label="`${r.severity}/5`">
            <span
              v-for="i in 5"
              :key="i"
              class="h-2 w-5 rounded-sm"
              :class="
                i <= r.severity ? (r.severity >= 4 ? 'bg-st-new' : 'bg-st-work') : 'bg-sand-2'
              "
            />
          </div>
        </div>
      </div>

      <!-- ИИ -->
      <div v-if="summary" class="rounded-xl bg-sand p-3">
        <div class="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span class="font-semibold text-teal">🤖 {{ t('card.ai') }}</span>
          <span v-if="r.aiProvider">· {{ t(`provider.${r.aiProvider}`) }}</span>
          <span v-if="r.aiProvider && r.aiProvider !== 'mock'">
            · {{ t('card.confidence', { p: Math.round(r.aiConfidence * 100) }) }}
          </span>
          <span v-if="r.categoryConfirmedByUser" class="text-st-done"
            >· ✓ {{ t('card.confirmed') }}</span
          >
        </div>
        <p class="text-sm">{{ summary }}</p>
      </div>

      <div v-if="r.comment" class="rounded-xl border border-sand-2 p-3">
        <p class="mb-1 text-xs text-muted">💬 {{ t('card.comment') }}</p>
        <p class="text-sm">{{ r.comment }}</p>
      </div>

      <!-- Факты -->
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt class="text-xs text-muted">{{ t('card.reported') }}</dt>
          <dd>{{ dayjs(r.createdAt).format('DD.MM.YYYY HH:mm') }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">{{ t('card.source') }}</dt>
          <dd>{{ t(`card.source${r.source}`) }}</dd>
        </div>
        <div v-if="r.executor">
          <dt class="text-xs text-muted">{{ t('card.executor') }}</dt>
          <dd>{{ locale === 'kk' ? r.executor.nameKk : r.executor.nameRu }}</dd>
        </div>
        <div v-if="r.resolvedAt">
          <dt class="text-xs text-muted">{{ t('card.resolvedIn') }}</dt>
          <dd class="font-semibold text-st-done">
            {{ formatDuration(r.createdAt, r.resolvedAt) }}
          </dd>
        </div>
        <div v-if="r.rejectReason" class="col-span-2">
          <dt class="text-xs text-muted">{{ t('card.reason') }}</dt>
          <dd>{{ r.rejectReason }}</dd>
        </div>
      </dl>

      <p v-if="r.duplicatesCount > 0" class="rounded-lg bg-caspian/5 px-3 py-2 text-sm">
        👥 {{ t('card.duplicates', { n: r.duplicatesCount }) }}
      </p>

      <!-- Таймлайн -->
      <section>
        <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {{ t('card.history') }}
        </h3>
        <ol class="relative ml-1.5 space-y-3 border-l-2 border-sand-2 pl-4">
          <li v-for="e in r.events" :key="e.id" class="relative">
            <span
              class="absolute top-1 -left-[23px] h-3 w-3 rounded-full border-2 border-white"
              :style="{ background: dotColor(e) }"
            />
            <p class="text-sm font-medium">{{ eventText(e) }}</p>
            <p class="text-xs text-muted">
              {{ dayjs(e.createdAt).format('DD.MM HH:mm') }} · {{ t(`actor.${e.actor}`) }}
              <template v-if="(e.payload as { reason?: string }).reason">
                · {{ (e.payload as { reason?: string }).reason }}
              </template>
            </p>
          </li>
        </ol>
      </section>
    </div>
  </section>
</template>
