<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LangSwitch from './LangSwitch.vue';

const { t } = useI18n();
const links = [
  { to: '/', key: 'nav.map', icon: '🗺' },
  { to: '/zones', key: 'nav.zones', icon: '🏆' },
  { to: '/report', key: 'nav.report', icon: '📸' },
];
</script>

<template>
  <header class="sticky top-0 z-[600] bg-caspian text-white shadow-md">
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
      <RouterLink to="/" class="mr-auto flex items-center gap-2">
        <img src="/favicon.svg" alt="" class="h-8 w-8 rounded-lg" />
        <span class="font-display text-lg font-extrabold max-sm:hidden">{{ t('app.title') }}</span>
      </RouterLink>
      <nav class="flex items-center gap-1 text-sm" aria-label="Main">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="rounded-lg px-2.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          exact-active-class="!bg-aqua !text-caspian font-semibold"
        >
          <span aria-hidden="true">{{ l.icon }}</span>
          <span class="max-sm:sr-only"> {{ t(l.key) }}</span>
        </RouterLink>
      </nav>
      <LangSwitch />
    </div>
  </header>
</template>
