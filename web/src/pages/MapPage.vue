<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMapStore } from '../stores/map';
import MapView from '../components/MapView.vue';
import SidePanel from '../components/SidePanel.vue';
import ReportCard from '../components/ReportCard.vue';
import ToastStack from '../components/ToastStack.vue';
import { botUrl } from '../lib/format';

const store = useMapStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

onMounted(async () => {
  await store.load();
  store.connect();
  // Ссылка из бота: /?r=42 — сразу открываем карточку
  const r = Number(route.query.r);
  if (Number.isInteger(r) && r > 0) store.selectedId = r;
});

// Открытая карточка отражается в URL — ссылкой можно поделиться
watch(
  () => store.selectedId,
  (id) => {
    const q = { ...route.query };
    if (id === null) delete q.r;
    else q.r = String(id);
    void router.replace({ query: q });
  },
);
</script>

<template>
  <main class="relative h-full w-full overflow-hidden">
    <MapView class="absolute inset-0 z-0" />

    <!-- Слой панелей поверх карты -->
    <div
      class="pointer-events-none absolute inset-0 z-[500] flex flex-col justify-end gap-3 p-3 md:flex-row md:items-start md:justify-between"
    >
      <SidePanel class="max-md:w-full" />
      <Transition name="sheet">
        <ReportCard
          v-if="store.selectedId !== null"
          :key="store.selectedId"
          class="max-md:absolute max-md:inset-x-3 max-md:top-3 max-md:bottom-3 max-md:w-auto"
        />
      </Transition>
    </div>

    <!-- Статус соединения -->
    <div
      class="absolute right-14 bottom-4 z-[500] flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium shadow max-md:hidden"
    >
      <span
        class="h-2 w-2 rounded-full"
        :class="store.connected ? 'animate-pulse bg-st-done' : 'bg-muted'"
      />
      {{ store.connected ? t('app.live') : t('app.offline') }}
    </div>

    <div v-if="store.loading" class="absolute inset-0 z-[600] grid place-items-center bg-sand/60">
      <p class="card px-5 py-3 text-sm font-medium">{{ t('app.loading') }}</p>
    </div>
    <div
      v-else-if="store.error"
      class="absolute inset-0 z-[600] grid place-items-center bg-sand/60"
    >
      <div class="card space-y-3 px-6 py-5 text-center">
        <p class="text-sm">{{ t('app.loadError') }}</p>
        <button
          type="button"
          class="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
          @click="store.load()"
        >
          {{ t('app.retry') }}
        </button>
      </div>
    </div>

    <!-- Пустая база: ещё ни одного сообщения — плашка исчезнет с первым репортом -->
    <div
      v-if="!store.loading && !store.error && !store.reports.length"
      class="pointer-events-none absolute inset-x-0 bottom-24 z-[550] flex justify-center px-4 md:bottom-8 md:pl-[360px]"
    >
      <a
        :href="botUrl"
        target="_blank"
        rel="noopener"
        class="card pointer-events-auto flex items-center gap-3 px-4 py-3 text-sm hover:shadow-lg"
      >
        <span class="text-xl" aria-hidden="true">🌊</span>
        <span>
          <span class="block font-semibold">{{ t('mapNone.title') }}</span>
          <span class="block text-xs text-muted">{{ t('mapNone.hint') }}</span>
        </span>
      </a>
    </div>

    <!-- Пустое состояние: по фильтрам ничего нет -->
    <div
      v-if="!store.loading && !store.error && store.reports.length && !store.visible.length"
      class="pointer-events-none absolute inset-x-0 bottom-24 z-[550] flex justify-center px-4 md:bottom-8 md:pl-[360px]"
    >
      <div class="card pointer-events-auto flex items-center gap-3 px-4 py-3 text-sm">
        <span aria-hidden="true">🔍</span>
        <div>
          <p class="font-semibold">{{ t('mapEmpty.title') }}</p>
          <p class="text-xs text-muted">{{ t('mapEmpty.hint') }}</p>
        </div>
        <button type="button" class="btn" @click="store.resetFilters()">
          {{ t('filters.reset') }}
        </button>
      </div>
    </div>

    <ToastStack />
  </main>
</template>
