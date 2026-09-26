<script setup lang="ts">
import L from '../lib/leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useMapStore } from '../stores/map';
import {
  CATEGORY_EMOJI,
  GROUP_COLOR,
  ZONE_COLOR,
  statusGroup,
  type StatusGroup,
} from '../lib/meta';
import type { Report, Zone } from '../types';

const AKTAU: L.LatLngTuple = [43.65, 51.17];

const store = useMapStore();
const { visible, zones, layers, fresh, selectedId } = storeToRefs(store);
const { locale } = useI18n();
const route = useRoute();
/** Из рейтинга: /?zone=ID — показать участок целиком, когда полигоны загрузятся. */
let pendingZone = Number(route.query.zone) || null;

const el = ref<HTMLDivElement | null>(null);
let map: L.Map;
let cluster: L.MarkerClusterGroup;
let zoneLayer: L.LayerGroup;
let heat: L.HeatLayer | null = null;
const markers = new Map<number, { marker: L.Marker; key: string }>();
const zonePolys = new Map<number, L.Polygon>();

const GROUP_RANK: Record<StatusGroup, number> = { new: 3, work: 2, done: 1, rejected: 0 };

function markerIcon(r: Report, isFresh: boolean) {
  const group = statusGroup(r.status);
  const badge = r.duplicatesCount > 0 ? `<b class="tk-badge">×${r.duplicatesCount + 1}</b>` : '';
  return L.divIcon({
    className: '',
    html: `<div class="tk-marker${isFresh ? ' tk-fresh' : ''}" style="--c:${GROUP_COLOR[group]}"><span>${CATEGORY_EMOJI[r.category]}</span>${badge}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/** Кластер окрашивается по «худшему» статусу внутри: есть новые — красный. */
function clusterIcon(c: L.MarkerCluster) {
  const children = c.getAllChildMarkers();
  const worst = children.reduce<StatusGroup>((acc, m) => {
    const g = (m.options as { group?: StatusGroup }).group ?? 'done';
    return GROUP_RANK[g] > GROUP_RANK[acc] ? g : acc;
  }, 'rejected');
  const n = children.length;
  const size = n < 10 ? 38 : n < 50 ? 46 : 54;
  return L.divIcon({
    className: '',
    html: `<div class="tk-cluster" style="--c:${GROUP_COLOR[worst]};width:${size}px;height:${size}px"><span>${n}</span></div>`,
    iconSize: [size, size],
  });
}

function syncMarkers() {
  const seen = new Set<number>();
  const toAdd: L.Marker[] = [];
  for (const r of visible.value) {
    seen.add(r.id);
    const isFresh = fresh.value.has(r.id);
    const key = `${r.status}|${r.category}|${r.duplicatesCount}|${isFresh}|${r.lat}|${r.lng}`;
    const existing = markers.get(r.id);
    if (existing) {
      if (existing.key !== key) {
        existing.marker.setIcon(markerIcon(r, isFresh));
        (existing.marker.options as { group?: StatusGroup }).group = statusGroup(r.status);
        existing.marker.setLatLng([r.lat, r.lng]);
        existing.key = key;
        cluster.refreshClusters(existing.marker);
      }
      continue;
    }
    const marker = L.marker([r.lat, r.lng], {
      icon: markerIcon(r, isFresh),
      keyboard: true,
      title: r.code,
      riseOnHover: true,
    });
    (marker.options as { group?: StatusGroup }).group = statusGroup(r.status);
    marker.on('click', () => (store.selectedId = r.id));
    markers.set(r.id, { marker, key });
    toAdd.push(marker);
  }
  if (toAdd.length) cluster.addLayers(toAdd);
  const toRemove: L.Marker[] = [];
  for (const [id, { marker }] of markers) {
    if (!seen.has(id)) {
      toRemove.push(marker);
      markers.delete(id);
    }
  }
  if (toRemove.length) cluster.removeLayers(toRemove);
  syncHeat();
}

function syncHeat() {
  if (!layers.value.heatmap) {
    if (heat) {
      map.removeLayer(heat);
      heat = null;
    }
    return;
  }
  // Тепловая карта — только открытые проблемы, вес по опасности
  const points: L.HeatLatLngTuple[] = visible.value
    .filter((r) => statusGroup(r.status) !== 'done')
    .map((r) => [r.lat, r.lng, 0.3 + (r.severity / 5) * 0.7]);
  if (heat) heat.setLatLngs(points);
  else {
    heat = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 15,
      minOpacity: 0.35,
      gradient: { 0.2: '#5FD1C1', 0.45: '#E0A43A', 0.75: '#C8553D', 1: '#7a1f12' },
    }).addTo(map);
  }
}

function zoneName(z: Zone) {
  return locale.value === 'kk' ? z.nameKk : z.nameRu;
}

function syncZones() {
  for (const z of zones.value) {
    const color = ZONE_COLOR[z.color];
    const latlngs = z.polygon.coordinates[0]!.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
    const tooltip = `<b>${zoneName(z)}</b><br>${Math.round(z.cleanIndex)} / 100`;
    const existing = zonePolys.get(z.id);
    if (existing) {
      existing.setStyle({ color, fillColor: color });
      existing.setTooltipContent(tooltip);
      continue;
    }
    const poly = L.polygon(latlngs, {
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.28,
      className: 'tk-zone',
    }).bindTooltip(tooltip, { sticky: true, direction: 'top', className: 'tk-tooltip' });
    zonePolys.set(z.id, poly);
    zoneLayer.addLayer(poly);
  }
}

function focusPendingZone() {
  if (!pendingZone) return;
  const poly = zonePolys.get(pendingZone);
  if (!poly) return;
  map.fitBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 15 });
  poly.openTooltip(poly.getBounds().getCenter());
  pendingZone = null;
}

function syncZoneVisibility() {
  if (layers.value.zones) zoneLayer.addTo(map);
  else zoneLayer.remove();
}

function focusSelected() {
  const id = selectedId.value;
  if (id === null) return;
  const entry = markers.get(id);
  if (entry) {
    cluster.zoomToShowLayer(entry.marker, () => {
      map.panTo(entry.marker.getLatLng(), { animate: true });
    });
  }
}

onMounted(() => {
  map = L.map(el.value!, { zoomControl: false, attributionControl: true }).setView(AKTAU, 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  zoneLayer = L.layerGroup();
  cluster = L.markerClusterGroup({
    iconCreateFunction: clusterIcon,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 45,
    chunkedLoading: true,
  });
  map.addLayer(cluster);

  syncZones();
  syncZoneVisibility();
  syncMarkers();
  focusSelected();
  focusPendingZone();
});

watch(visible, syncMarkers);
watch(() => fresh.value.size, syncMarkers);
watch(
  zones,
  () => {
    syncZones();
    focusPendingZone();
  },
  { deep: true },
);
watch(locale, syncZones);
watch(() => layers.value.heatmap, syncHeat);
watch(() => layers.value.zones, syncZoneVisibility);
watch(selectedId, focusSelected);

/** Карта знает о размере контейнера только при init — пересчёт при изменении раскладки. */
defineExpose({ invalidate: () => map?.invalidateSize() });

onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div ref="el" class="h-full w-full" role="application" aria-label="Map" />
</template>
