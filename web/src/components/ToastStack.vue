<script setup lang="ts">
import { useMapStore } from '../stores/map';

const store = useMapStore();

function open(id?: number) {
  if (id !== undefined) store.selectedId = id;
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex flex-col items-center gap-2 px-3"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <button
        v-for="toast in store.toasts"
        :key="toast.id"
        type="button"
        class="card pointer-events-auto flex max-w-md items-center gap-3 px-4 py-3 text-left text-sm font-medium"
        @click="open(toast.reportId)"
      >
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
          :class="toast.kind === 'new' ? 'bg-st-new' : 'bg-st-done'"
          aria-hidden="true"
        >
          {{ toast.kind === 'new' ? '📍' : '✓' }}
        </span>
        <span>{{ toast.text }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
