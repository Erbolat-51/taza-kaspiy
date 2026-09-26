<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { setLang } from '../i18n';
import type { Lang } from '../types';

const { locale } = useI18n();
const langs: { code: Lang; label: string }[] = [
  { code: 'kk', label: 'ҚАЗ' },
  { code: 'ru', label: 'РУС' },
];
</script>

<template>
  <div
    class="flex rounded-full bg-caspian-2 p-0.5 text-xs font-semibold"
    role="group"
    aria-label="Language"
  >
    <button
      v-for="l in langs"
      :key="l.code"
      type="button"
      class="rounded-full px-2.5 py-1 transition"
      :class="locale === l.code ? 'bg-aqua text-caspian' : 'text-white/75 hover:text-white'"
      :aria-pressed="locale === l.code"
      @click="setLang(l.code)"
    >
      {{ l.label }}
    </button>
  </div>
</template>
