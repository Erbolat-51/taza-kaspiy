<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAdmin } from '../store';

const store = useAdmin();
const { t, locale } = useI18n();
const ICON = { UTILITY: '🚛', ECOLOGY: '🌿', VOLUNTEER_ORG: '🙋', ANIMAL_RESCUE: '🦭' } as const;
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <h1 class="mb-4 font-display text-2xl font-bold">{{ t('admin.executors.title') }}</h1>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="e in store.executors" :key="e.id" class="rounded-2xl bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-2xl" aria-hidden="true">{{ ICON[e.kind] }}</span>
          <div>
            <h2 class="leading-tight font-semibold">{{ locale === 'kk' ? e.nameKk : e.nameRu }}</h2>
            <p class="text-xs text-muted">{{ t(`admin.executors.kind.${e.kind}`) }}</p>
          </div>
        </div>
        <p class="mb-3 text-sm">{{ t('admin.executors.active', { n: e.activeTasks }) }}</p>
        <p v-if="e.linked" class="rounded-lg bg-st-done/10 px-3 py-2 text-sm text-st-done">
          📱 {{ t('admin.executors.linked') }}
          <template v-if="e.tgUser?.username"> · @{{ e.tgUser.username }}</template>
        </p>
        <div v-else class="rounded-lg bg-sand px-3 py-2">
          <p class="text-xs text-muted">{{ t('admin.executors.linkHint') }}</p>
          <p class="font-mono text-lg font-bold tracking-wider">/link {{ e.linkCode }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
