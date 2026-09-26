<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { api } from '../api';
import { getSocket } from '../lib/socket';
import { ZONE_COLOR } from '../lib/meta';
import type { Zone, ZoneKind } from '../types';
import PublicHeader from '../components/PublicHeader.vue';

const { t, locale } = useI18n();
const zones = ref<Zone[]>([]);
const loading = ref(true);
const error = ref(false);
const kind = ref<ZoneKind | 'all'>('all');

async function load() {
  loading.value = zones.value.length === 0;
  error.value = false;
  try {
    zones.value = await api.zones();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

const kinds = computed(() => {
  const present = new Set(zones.value.map((z) => z.kind));
  return (
    ['CITY_BEACH', 'RESORT', 'WILD_COAST', 'SETTLEMENT', 'PORT_INDUSTRIAL'] as ZoneKind[]
  ).filter((k) => present.has(k));
});

/** Рейтинг: чище — выше; при равном индексе выше тот, где больше убрали за месяц. */
const ranked = computed(() =>
  zones.value
    .filter((z) => kind.value === 'all' || z.kind === kind.value)
    .sort((a, b) => b.cleanIndex - a.cleanIndex || b.resolved30d - a.resolved30d),
);

const name = (z: Zone) => (locale.value === 'kk' ? z.nameKk : z.nameRu);

// Индекс меняется в реальном времени (новый репорт / уборка)
const onZone = ({
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
  void load();
};
onMounted(() => {
  void load();
  getSocket().on('zone:updated', onZone);
});
onBeforeUnmount(() => getSocket().off('zone:updated', onZone));
</script>

<template>
  <div class="min-h-full bg-sand">
    <PublicHeader />
    <main class="mx-auto max-w-5xl px-4 py-6">
      <h1 class="font-display text-2xl font-extrabold md:text-3xl">{{ t('zones.title') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted">{{ t('zones.subtitle') }}</p>

      <div class="mt-4 flex flex-wrap gap-1.5" role="group">
        <button type="button" class="chip" :aria-pressed="kind === 'all'" @click="kind = 'all'">
          {{ t('zones.all') }}
        </button>
        <button
          v-for="k in kinds"
          :key="k"
          type="button"
          class="chip"
          :aria-pressed="kind === k"
          @click="kind = k"
        >
          {{ t(`zones.kind.${k}`) }}
        </button>
      </div>

      <p v-if="loading" class="mt-8 text-center text-sm text-muted">{{ t('app.loading') }}</p>
      <div v-else-if="error" class="card mt-8 p-6 text-center">
        <p class="text-sm">{{ t('app.loadError') }}</p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
          @click="load"
        >
          {{ t('app.retry') }}
        </button>
      </div>
      <p v-else-if="!ranked.length" class="mt-8 text-center text-sm text-muted">
        {{ t('zones.empty') }}
      </p>

      <ol v-else class="mt-5 grid gap-3 md:grid-cols-2">
        <li v-for="(z, i) in ranked" :key="z.id" class="card flex gap-4 p-4">
          <div
            class="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl"
            :style="{ background: `${ZONE_COLOR[z.color]}1a` }"
          >
            <span class="text-xs font-semibold text-muted">#{{ i + 1 }}</span>
            <span
              class="font-display text-3xl font-extrabold tabular-nums"
              :style="{ color: ZONE_COLOR[z.color] }"
            >
              {{ Math.round(z.cleanIndex) }}
            </span>
            <span class="text-[11px] font-semibold" :style="{ color: ZONE_COLOR[z.color] }">{{
              t(`zones.level.${z.color}`)
            }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="truncate font-semibold">{{ name(z) }}</h2>
                <p class="text-xs text-muted">{{ t(`zones.kind.${z.kind}`) }}</p>
              </div>
              <RouterLink
                :to="{ path: '/', query: { zone: z.id } }"
                class="shrink-0 text-sm font-medium text-teal hover:underline"
              >
                🗺 {{ t('zones.showOnMap') }}
              </RouterLink>
            </div>
            <div
              class="mt-2 h-2 overflow-hidden rounded-full bg-sand-2"
              role="meter"
              :aria-valuenow="Math.round(z.cleanIndex)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full rounded-full transition-all"
                :style="{ width: `${z.cleanIndex}%`, background: ZONE_COLOR[z.color] }"
              />
            </div>
            <dl class="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
              <div>{{ t('zones.open', { n: z.openCount }) }}</div>
              <div>✅ {{ t('zones.resolved30', { n: z.resolved30d }) }}</div>
              <div>
                {{
                  z.lastReportAt
                    ? t('zones.last', { t: dayjs(z.lastReportAt).fromNow() })
                    : t('zones.never')
                }}
              </div>
            </dl>
          </div>
        </li>
      </ol>

      <details class="card mt-6 p-4 text-sm">
        <summary class="cursor-pointer font-semibold">ℹ️ {{ t('zones.howTitle') }}</summary>
        <p class="mt-2 text-muted">{{ t('zones.how') }}</p>
      </details>
    </main>
  </div>
</template>
