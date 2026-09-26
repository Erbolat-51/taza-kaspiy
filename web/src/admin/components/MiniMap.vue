<script setup lang="ts">
import L from '../../lib/leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ lat: number; lng: number; color: string }>();
const el = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;

const icon = () =>
  L.divIcon({
    className: '',
    html: `<div class="tk-marker" style="--c:${props.color};width:22px;height:22px;border-width:3px"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

onMounted(() => {
  map = L.map(el.value!, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
  }).setView([props.lat, props.lng], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  marker = L.marker([props.lat, props.lng], { icon: icon(), interactive: false }).addTo(map);
});

watch(
  () => [props.lat, props.lng, props.color] as const,
  () => {
    if (!map || !marker) return;
    marker.setLatLng([props.lat, props.lng]).setIcon(icon());
    map.setView([props.lat, props.lng]);
  },
);

onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div ref="el" class="h-40 w-full overflow-hidden rounded-xl" aria-hidden="true" />
</template>
