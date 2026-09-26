<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapStore, type PeriodFilter, type StatusFilter } from '../stores/map';
import { CATEGORIES, CATEGORY_EMOJI, GROUP_COLOR, ZONE_COLOR, indexColor } from '../lib/meta';
import { botUrl } from '../lib/format';
import LangSwitch from './LangSwitch.vue';

const store = useMapStore();
const { t } = useI18n();
/** На телефоне панель — нижний лист: свёрнута до шапки с KPI. */
const expanded = ref(false);

const statuses: { v: StatusFilter; key: string; color?: string }[] = [
  { v: 'all', key: 'filters.statusAll' },
  { v: 'new', key: 'filters.statusNew', color: GROUP_COLOR.new },
  { v: 'work', key: 'filters.statusWork', color: GROUP_COLOR.work },
  { v: 'done', key: 'filters.statusDone', color: GROUP_COLOR.done },
];
const periods: { v: PeriodFilter; key: string }[] = [
  { v: 7, key: 'filters.days7' },
  { v: 30, key: 'filters.days30' },
  { v: 90, key: 'filters.days90' },
  { v: 0, key: 'filters.daysAll' },
];
</script>

<template>
  <aside
    class="pointer-events-auto flex max-h-full flex-col overflow-hidden md:w-[340px]"
    :class="expanded ? 'max-md:max-h-[75vh]' : 'max-md:max-h-[168px]'"
  >
    <!-- Шапка -->
    <header
      class="rounded-t-2xl bg-caspian px-4 pt-3 pb-3 text-white md:rounded-2xl md:rounded-b-none"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" class="h-9 w-9 rounded-xl" />
          <div>
            <h1 class="font-display text-lg leading-tight font-extrabold">{{ t('app.title') }}</h1>
            <p class="text-xs text-white/70">{{ t('app.tagline') }}</p>
          </div>
        </div>
        <LangSwitch />
      </div>

      <!-- KPI -->
      <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-white/8 px-1 py-2">
          <dd class="font-display text-xl font-bold text-[#ff8a70]">
            {{ store.summary?.open ?? '–' }}
          </dd>
          <dt class="text-[11px] leading-tight text-white/70">{{ t('summary.open') }}</dt>
        </div>
        <div class="rounded-xl bg-white/8 px-1 py-2">
          <dd class="font-display text-xl font-bold text-aqua">
            {{ store.summary?.resolved7d ?? '–' }}
          </dd>
          <dt class="text-[11px] leading-tight text-white/70">{{ t('summary.resolved7d') }}</dt>
        </div>
        <div class="rounded-xl bg-white/8 px-1 py-2">
          <dd
            class="font-display text-xl font-bold"
            :style="{ color: store.summary ? indexColor(store.summary.avgIndex) : undefined }"
          >
            {{ store.summary ? Math.round(store.summary.avgIndex) : '–' }}
          </dd>
          <dt class="text-[11px] leading-tight text-white/70">{{ t('summary.avgIndex') }}</dt>
        </div>
      </dl>

      <button
        type="button"
        class="mx-auto mt-2 block h-1.5 w-12 rounded-full bg-white/30 md:hidden"
        :aria-expanded="expanded"
        :aria-label="t('filters.title')"
        @click="expanded = !expanded"
      />
    </header>

    <div class="flex-1 space-y-5 overflow-y-auto rounded-b-2xl bg-white px-4 py-4">
      <!-- CTA -->
      <a
        :href="botUrl"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-3 rounded-xl bg-teal px-4 py-3 text-white shadow-sm transition hover:bg-[#0b6a61]"
      >
        <span class="text-2xl" aria-hidden="true">📸</span>
        <span>
          <span class="block font-semibold">{{ t('app.reportCta') }}</span>
          <span class="block text-xs text-white/80">{{ t('app.reportCtaHint') }}</span>
        </span>
      </a>

      <!-- Статус -->
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-xs font-semibold tracking-wide text-muted uppercase">
            {{ t('filters.status') }}
          </h2>
          <button
            v-if="store.filtersActive"
            type="button"
            class="text-xs font-medium text-teal hover:underline"
            @click="store.resetFilters()"
          >
            {{ t('filters.reset') }}
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in statuses"
            :key="s.v"
            type="button"
            class="chip"
            :aria-pressed="store.filters.status === s.v"
            @click="store.filters.status = s.v"
          >
            <span
              v-if="s.color"
              class="h-2.5 w-2.5 rounded-full"
              :style="{ background: s.color }"
            />
            {{ t(s.key) }}
          </button>
        </div>
      </section>

      <!-- Период -->
      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {{ t('filters.period') }}
        </h2>
        <div class="grid grid-cols-4 gap-1 rounded-xl bg-sand p-1">
          <button
            v-for="p in periods"
            :key="p.v"
            type="button"
            class="rounded-lg px-1 py-1.5 text-xs font-medium transition"
            :class="
              store.filters.days === p.v
                ? 'bg-white text-caspian shadow-sm'
                : 'text-muted hover:text-caspian'
            "
            :aria-pressed="store.filters.days === p.v"
            @click="store.filters.days = p.v"
          >
            {{ t(p.key) }}
          </button>
        </div>
      </section>

      <!-- Категории -->
      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {{ t('filters.categories') }}
        </h2>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in CATEGORIES"
            :key="c"
            type="button"
            class="chip !px-2.5 !py-1 !text-xs"
            :aria-pressed="store.filters.categories.includes(c)"
            @click="store.toggleCategory(c)"
          >
            <span aria-hidden="true">{{ CATEGORY_EMOJI[c] }}</span
            >{{ t(`category.${c}`) }}
          </button>
        </div>
        <p class="mt-2 text-xs text-muted">{{ t('filters.shown', { n: store.visible.length }) }}</p>
      </section>

      <!-- Слои -->
      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {{ t('layers.title') }}
        </h2>
        <label class="flex cursor-pointer items-center justify-between py-1 text-sm">
          <span>🔥 {{ t('layers.heatmap') }}</span>
          <input v-model="store.layers.heatmap" type="checkbox" class="h-4 w-4 accent-teal" />
        </label>
        <label class="flex cursor-pointer items-center justify-between py-1 text-sm">
          <span>🌊 {{ t('layers.zones') }}</span>
          <input v-model="store.layers.zones" type="checkbox" class="h-4 w-4 accent-teal" />
        </label>
      </section>

      <!-- Легенда -->
      <section class="rounded-xl bg-sand p-3 text-xs">
        <h2 class="mb-2 font-semibold tracking-wide text-muted uppercase">
          {{ t('legend.title') }}
        </h2>
        <ul class="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          <li
            v-for="g in ['new', 'work', 'done'] as const"
            :key="g"
            class="flex items-center gap-1.5"
          >
            <span
              class="h-3 w-3 rounded-full border-2 border-white shadow"
              :style="{ background: GROUP_COLOR[g] }"
            />
            {{ t(`legend.${g}`) }}
          </li>
        </ul>
        <p class="mb-1 text-muted">{{ t('legend.zoneIndex') }}</p>
        <ul class="flex flex-wrap gap-x-3 gap-y-1">
          <li class="flex items-center gap-1.5">
            <span class="h-2.5 w-5 rounded-sm" :style="{ background: ZONE_COLOR.green }" />{{
              t('legend.clean')
            }}
          </li>
          <li class="flex items-center gap-1.5">
            <span class="h-2.5 w-5 rounded-sm" :style="{ background: ZONE_COLOR.yellow }" />{{
              t('legend.medium')
            }}
          </li>
          <li class="flex items-center gap-1.5">
            <span class="h-2.5 w-5 rounded-sm" :style="{ background: ZONE_COLOR.red }" />{{
              t('legend.dirty')
            }}
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>
