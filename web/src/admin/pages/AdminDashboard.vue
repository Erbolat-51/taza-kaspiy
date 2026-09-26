<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'vue-chartjs';
import L from '../../lib/leaflet';
import 'leaflet.heat';
import { adminApi } from '../api';
import { useAdmin } from '../store';
import type { Dashboard } from '../types';
import { CATEGORY_EMOJI, ZONE_COLOR, indexColor } from '../../lib/meta';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

const store = useAdmin();
const { t, locale } = useI18n();
const data = ref<Dashboard | null>(null);

/**
 * Палитра серий проверена валидатором (CVD/контраст). Брендовые #0B2A3A/#0E7C72 для серий
 * не проходят по насыщенности — они остаются цветами интерфейса, а не данных.
 * Цвета статуса (зелёный/жёлтый/красный) — только для индекса чистоты, всегда с подписью.
 */
const SERIES = { created: '#2a78d6', resolved: '#eb6834' };
const CATEGORY_COLOR: Record<string, string> = {
  PLASTIC: '#2a78d6',
  TRASH: '#eb6834',
  OIL: '#1baf7a',
  DEAD_ANIMAL: '#eda100',
  SEWAGE: '#e87ba4',
  CONSTRUCTION: '#008300',
  OTHER: '#4a3aa7',
};
const INK = { primary: '#0B2A3A', secondary: '#5b6b77', grid: '#ebe6db' };

async function load() {
  data.value = await adminApi.dashboard();
}

// Live: любое событие по репортам → перечитать агрегаты (с задержкой, пачкой)
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => store.version,
  () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void load().catch(() => {}), 800);
  },
);

const name = (z: { nameKk: string; nameRu: string }) =>
  locale.value === 'kk' ? z.nameKk : z.nameRu;

// ───────── Линия: поступило / убрано ─────────
/** Прямые подписи серий у последней точки — идентичность не только цветом. */
const endLabels: Plugin<'line'> = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      const last = meta.data.at(-1);
      if (!last || meta.hidden) return;
      ctx.save();
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = INK.secondary;
      ctx.textAlign = 'right';
      ctx.fillText(String(ds.label), last.x - 6, last.y - 8 - i * 12);
      ctx.restore();
    });
  },
};

const lineData = computed(() => ({
  labels: data.value?.daily.map((d) => dayjs(d.day).format('DD.MM')) ?? [],
  datasets: [
    {
      label: t('admin.dash.created'),
      data: data.value?.daily.map((d) => d.created) ?? [],
      borderColor: SERIES.created,
      backgroundColor: SERIES.created,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
    },
    {
      label: t('admin.dash.resolved'),
      data: data.value?.daily.map((d) => d.resolved) ?? [],
      borderColor: SERIES.resolved,
      backgroundColor: SERIES.resolved,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
    },
  ],
}));

const lineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  layout: { padding: { top: 18 } }, // место для прямых подписей серий
  plugins: {
    legend: {
      position: 'bottom',
      align: 'start',
      labels: { usePointStyle: true, pointStyle: 'line', color: INK.secondary, boxWidth: 18 },
    },
    tooltip: { backgroundColor: INK.primary, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: INK.secondary, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      border: { display: false },
    },
    y: {
      beginAtZero: true,
      grid: { color: INK.grid },
      ticks: { color: INK.secondary, precision: 0 },
      border: { display: false },
    },
  },
};

// ───────── Donut по категориям ─────────
const categoryRows = computed(() => {
  const entries = Object.entries(data.value?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return entries.map(([cat, n]) => ({ cat, n, pct: total ? Math.round((n / total) * 100) : 0 }));
});
const donutData = computed(() => ({
  labels: categoryRows.value.map((r) => t(`category.${r.cat}`)),
  datasets: [
    {
      data: categoryRows.value.map((r) => r.n),
      backgroundColor: categoryRows.value.map((r) => CATEGORY_COLOR[r.cat]),
      borderColor: '#fff',
      borderWidth: 2, // зазор между сегментами
      hoverOffset: 6,
    },
  ],
}));
const donutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: { display: false }, // легенда — таблица рядом, с числами
    tooltip: { backgroundColor: INK.primary, padding: 10, cornerRadius: 8 },
  },
};

// ───────── Бар по зонам ─────────
const zoneRows = computed(() =>
  [...(data.value?.zones ?? [])].filter((z) => z.open > 0).sort((a, b) => b.open - a.open),
);
const barData = computed(() => ({
  labels: zoneRows.value.map((z) => name(z)),
  datasets: [
    {
      label: t('admin.dash.byZone'),
      data: zoneRows.value.map((z) => z.open),
      backgroundColor: zoneRows.value.map((z) => indexColor(z.cleanIndex)),
      borderRadius: 4,
      borderSkipped: 'start' as const,
      barThickness: 14,
    },
  ],
}));
const barOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: INK.primary,
      padding: 10,
      cornerRadius: 8,
      callbacks: {
        label: (c) =>
          `${t('admin.dash.open', { n: c.parsed.x })} · ${t('summary.avgIndex')}: ${Math.round(zoneRows.value[c.dataIndex]!.cleanIndex)}`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: INK.grid },
      ticks: { color: INK.secondary, precision: 0 },
      border: { display: false },
    },
    y: { grid: { display: false }, ticks: { color: INK.primary }, border: { display: false } },
  },
}));

// ───────── Мини тепловая карта ─────────
const heatEl = ref<HTMLDivElement | null>(null);
let heatMap: L.Map | null = null;
let heatLayer: L.HeatLayer | null = null;

function drawHeat() {
  if (!heatEl.value || !data.value) return;
  if (!heatMap) {
    heatMap = L.map(heatEl.value, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    }).setView([43.65, 51.17], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(heatMap);
  }
  const points = data.value.heat.map(
    ([lat, lng, s]) => [lat, lng, 0.3 + (s / 5) * 0.7] as L.HeatLatLngTuple,
  );
  if (heatLayer) heatLayer.setLatLngs(points);
  else {
    heatLayer = L.heatLayer(points, {
      radius: 22,
      blur: 18,
      minOpacity: 0.35,
      gradient: { 0.2: '#5FD1C1', 0.45: '#E0A43A', 0.75: '#C8553D', 1: '#7a1f12' },
    }).addTo(heatMap);
  }
}
watch(data, () => requestAnimationFrame(drawHeat));

onMounted(() => void load());
onBeforeUnmount(() => {
  heatMap?.remove();
  if (timer) clearTimeout(timer);
});

const kpis = computed(() => {
  const k = data.value?.kpi;
  return [
    { key: 'newToday', value: k?.newToday ?? '–', icon: '🆕' },
    { key: 'inWork', value: k?.inWork ?? '–', icon: '🚧' },
    { key: 'resolvedWeek', value: k?.resolvedWeek ?? '–', icon: '✅' },
    {
      key: 'avgResolve',
      value:
        k?.avgResolveHours == null
          ? '–'
          : k.avgResolveHours < 1
            ? t('duration.minutes', { n: Math.max(1, Math.round(k.avgResolveHours * 60)) })
            : t('admin.dash.hours', { n: k.avgResolveHours }),
      icon: '⏱',
    },
    {
      key: 'avgIndex',
      value: k ? Math.round(k.avgIndex) : '–',
      icon: '🌊',
      color: k ? indexColor(k.avgIndex) : undefined,
    },
  ];
});
</script>

<template>
  <div class="h-full overflow-y-auto p-3 md:p-5">
    <h1 class="mb-4 font-display text-2xl font-bold">{{ t('admin.dash.title') }}</h1>

    <!-- KPI -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
      <div v-for="k in kpis" :key="k.key" class="rounded-2xl bg-white p-4 shadow-sm">
        <p class="text-xs text-muted">{{ k.icon }} {{ t(`admin.dash.${k.key}`) }}</p>
        <p class="mt-1 font-display text-3xl font-bold tabular-nums" :style="{ color: k.color }">
          {{ k.value }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <!-- Линия -->
      <section class="rounded-2xl bg-white p-4 shadow-sm xl:col-span-2">
        <h2 class="mb-2 text-sm font-semibold">{{ t('admin.dash.daily') }}</h2>
        <div class="h-64">
          <Line v-if="data" :data="lineData" :options="lineOptions" :plugins="[endLabels]" />
        </div>
      </section>

      <!-- Donut -->
      <section class="rounded-2xl bg-white p-4 shadow-sm">
        <h2 class="mb-2 text-sm font-semibold">{{ t('admin.dash.byCategory') }}</h2>
        <div v-if="categoryRows.length" class="flex items-center gap-4">
          <div class="h-32 w-32 shrink-0">
            <Doughnut :data="donutData" :options="donutOptions" />
          </div>
          <ul class="min-w-0 flex-1 space-y-1.5 text-xs">
            <li v-for="r in categoryRows" :key="r.cat" class="flex items-center gap-2">
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-sm"
                :style="{ background: CATEGORY_COLOR[r.cat] }"
              />
              <span class="min-w-0 leading-tight"
                >{{ CATEGORY_EMOJI[r.cat as keyof typeof CATEGORY_EMOJI] }}
                {{ t(`category.${r.cat}`) }}</span
              >
              <span class="ml-auto font-semibold tabular-nums">{{ r.n }}</span>
              <span class="w-9 text-right text-xs text-muted tabular-nums">{{ r.pct }}%</span>
            </li>
          </ul>
        </div>
        <p v-else class="py-10 text-center text-sm text-muted">{{ t('admin.dash.noData') }}</p>
      </section>

      <!-- Бар по зонам -->
      <section class="rounded-2xl bg-white p-4 shadow-sm xl:col-span-2">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{{ t('admin.dash.byZone') }}</h2>
          <ul class="flex gap-3 text-xs text-muted">
            <li class="flex items-center gap-1">
              <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: ZONE_COLOR.green }" />{{
                t('legend.clean')
              }}
            </li>
            <li class="flex items-center gap-1">
              <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: ZONE_COLOR.yellow }" />{{
                t('legend.medium')
              }}
            </li>
            <li class="flex items-center gap-1">
              <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: ZONE_COLOR.red }" />{{
                t('legend.dirty')
              }}
            </li>
          </ul>
        </div>
        <div
          v-if="zoneRows.length"
          :style="{ height: `${Math.max(160, zoneRows.length * 30 + 40)}px` }"
        >
          <Bar :data="barData" :options="barOptions" />
        </div>
        <p v-else class="py-10 text-center text-sm text-muted">{{ t('admin.dash.noData') }}</p>
      </section>

      <!-- Топ-5 -->
      <section class="rounded-2xl bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold">{{ t('admin.dash.topZones') }}</h2>
        <ol v-if="data?.topProblemZones.length" class="space-y-2.5">
          <li v-for="(z, i) in data.topProblemZones" :key="z.id" class="flex items-center gap-3">
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sand text-xs font-bold"
              >{{ i + 1 }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ name(z) }}</p>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  class="h-full rounded-full"
                  :style="{ width: `${z.cleanIndex}%`, background: indexColor(z.cleanIndex) }"
                />
              </div>
            </div>
            <div class="text-right">
              <p
                class="font-display font-bold tabular-nums"
                :style="{ color: indexColor(z.cleanIndex) }"
              >
                {{ Math.round(z.cleanIndex) }}
              </p>
              <p class="text-[11px] text-muted">{{ t('admin.dash.open', { n: z.open }) }}</p>
            </div>
          </li>
        </ol>
        <p v-else class="py-6 text-center text-sm text-muted">{{ t('admin.dash.noData') }}</p>
      </section>

      <!-- Тепловая карта -->
      <section class="rounded-2xl bg-white p-4 shadow-sm xl:col-span-3">
        <h2 class="mb-2 text-sm font-semibold">{{ t('admin.dash.heat') }}</h2>
        <div ref="heatEl" class="h-72 w-full overflow-hidden rounded-xl" />
      </section>
    </div>
  </div>
</template>
