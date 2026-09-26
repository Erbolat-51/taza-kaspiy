<script setup lang="ts">
import L from '../lib/leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ZONE_COLOR } from '../lib/meta';
import type { Zone } from '../types';

/** Карта выбора точки: клик ставит маркер. Зоны побережья подсвечены как подсказка. */
const props = defineProps<{ point: { lat: number; lng: number } | null; zones: Zone[] }>();
const emit = defineEmits<{ pick: [{ lat: number; lng: number }] }>();

const el = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;
let zoneLayer: L.LayerGroup | null = null;

const icon = L.divIcon({
  className: '',
  html: '<div class="tk-marker tk-fresh" style="--c:#C8553D"><span>📍</span></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function drawZones() {
  if (!map) return;
  zoneLayer?.remove();
  zoneLayer = L.layerGroup(
    props.zones.map((z) =>
      L.polygon(
        z.polygon.coordinates[0]!.map(([lng, lat]) => [lat, lng] as L.LatLngTuple),
        { color: ZONE_COLOR[z.color], weight: 1.5, fillOpacity: 0.15, interactive: false },
      ),
    ),
  ).addTo(map);
}

function placeMarker() {
  if (!map || !props.point) return;
  const ll: L.LatLngTuple = [props.point.lat, props.point.lng];
  if (marker) marker.setLatLng(ll);
  else marker = L.marker(ll, { icon, interactive: false }).addTo(map);
}

onMounted(() => {
  map = L.map(el.value!, { zoomControl: true, attributionControl: true }).setView(
    [43.65, 51.17],
    12,
  );
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.on('click', (e: L.LeafletMouseEvent) =>
    emit('pick', { lat: e.latlng.lat, lng: e.latlng.lng }),
  );
  drawZones();
  placeMarker();
});

watch(() => props.zones, drawZones);
watch(
  () => props.point,
  (p, prev) => {
    placeMarker();
    // Геолокация: точка пришла не кликом — подлетаем к ней
    if (p && map && (!prev || Math.abs(p.lat - prev.lat) + Math.abs(p.lng - prev.lng) > 0.01)) {
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
    }
  },
);
onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div ref="el" class="h-72 w-full overflow-hidden rounded-xl md:h-80" role="application" />
</template>
