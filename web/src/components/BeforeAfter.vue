<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{ before: string; after: string }>();
const { t } = useI18n();
/** Позиция разделителя в процентах: слева «до», справа «после». */
const pos = ref(50);
</script>

<template>
  <div class="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-sand-2 select-none">
    <img
      :src="after"
      :alt="t('card.after')"
      class="absolute inset-0 h-full w-full object-cover"
      draggable="false"
    />
    <img
      :src="before"
      :alt="t('card.before')"
      class="absolute inset-0 h-full w-full object-cover"
      :style="{ clipPath: `inset(0 ${100 - pos}% 0 0)` }"
      draggable="false"
    />
    <div
      class="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
      :style="{ left: `${pos}%` }"
    >
      <span
        class="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-caspian shadow-lg"
        aria-hidden="true"
        >⇆</span
      >
    </div>
    <span
      class="absolute top-2 left-2 rounded-full bg-st-new/90 px-2 py-0.5 text-xs font-semibold text-white"
    >
      {{ t('card.before') }}
    </span>
    <span
      class="absolute top-2 right-2 rounded-full bg-st-done/90 px-2 py-0.5 text-xs font-semibold text-white"
    >
      {{ t('card.after') }}
    </span>
    <input
      v-model.number="pos"
      type="range"
      min="0"
      max="100"
      class="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      :aria-label="`${t('card.before')} / ${t('card.after')}`"
    />
  </div>
</template>
