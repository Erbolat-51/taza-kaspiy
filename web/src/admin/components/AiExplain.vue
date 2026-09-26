<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Category } from '../../types';
import type { AiRaw } from '../types';

const props = defineProps<{
  aiRaw: AiRaw | null;
  category: Category;
  confidence: number;
  confirmedByUser: boolean;
  /** Категорию изменил автор (есть событие COMMENT kind=category, confirmed=false) */
  changedByUser: boolean;
}>();
const { t, te } = useI18n();

const provider = computed(() => props.aiRaw?.provider ?? 'mock');
const raw = computed(() => props.aiRaw?.raw ?? {});
const POLLUTION = new Set(['PLASTIC', 'TRASH', 'OIL', 'DEAD_ANIMAL', 'SEWAGE', 'CONSTRUCTION']);

const classLabel = (cls: string) =>
  te(`category.${cls}`) && POLLUTION.has(cls) ? t(`category.${cls}`) : t(`admin.ai.classes.${cls}`);

const note = computed(() =>
  provider.value === 'claude'
    ? t('admin.ai.claudeNote')
    : provider.value === 'clip'
      ? t('admin.ai.clipNote')
      : t('admin.ai.mockNote'),
);
const pct = (x: number) => `${Math.round(x * 100)}%`;
</script>

<template>
  <section class="rounded-xl border border-sand-2 bg-sand/50 p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">🤖 {{ t('admin.ai.title') }}</h3>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-semibold"
        :class="provider === 'mock' ? 'bg-sand-2 text-muted' : 'bg-teal text-white'"
      >
        {{ t(`provider.${provider}`) }}
      </span>
    </div>
    <p class="mb-3 text-xs text-muted">{{ note }}</p>

    <dl class="mb-3 grid grid-cols-3 gap-2 text-xs">
      <div v-if="raw.model" class="col-span-3">
        <dt class="text-muted">{{ t('admin.ai.model') }}</dt>
        <dd class="font-mono text-[11px] break-all">
          {{ raw.model }}<span v-if="raw.dtype" class="text-muted"> · {{ raw.dtype }}</span>
        </dd>
      </div>
      <div v-if="provider !== 'mock'">
        <dt class="text-muted">{{ t('admin.ai.confidence') }}</dt>
        <dd class="font-semibold" :class="confidence < 0.6 ? 'text-st-work' : 'text-st-done'">
          {{ pct(confidence) }}
        </dd>
      </div>
      <div v-if="raw.ms !== undefined">
        <dt class="text-muted">{{ t('admin.ai.time') }}</dt>
        <dd>{{ raw.ms }} ms</dd>
      </div>
      <div v-if="raw.usage" class="col-span-3">
        <dt class="text-muted">{{ t('admin.ai.tokens') }}</dt>
        <dd>{{ raw.usage.input_tokens }} → {{ raw.usage.output_tokens }}</dd>
      </div>
    </dl>

    <div v-if="raw.top3?.length">
      <p class="mb-1.5 text-xs font-medium text-muted">{{ t('admin.ai.top3') }}</p>
      <ul class="space-y-1.5">
        <li v-for="(c, i) in raw.top3" :key="c.cls" class="text-xs">
          <div class="mb-0.5 flex justify-between">
            <span :class="i === 0 ? 'font-semibold' : ''">{{ classLabel(c.cls) }}</span>
            <span class="tabular-nums">{{ pct(c.score) }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white">
            <div
              class="h-full rounded-full transition-all"
              :class="POLLUTION.has(c.cls) ? (i === 0 ? 'bg-st-new' : 'bg-st-new/40') : 'bg-aqua'"
              :style="{ width: pct(c.score) }"
            />
          </div>
        </li>
      </ul>
    </div>

    <p v-if="raw.fallbackReason" class="mt-2 text-xs text-st-work">
      ⚠ {{ t('admin.ai.fallback') }}: <span class="font-mono">{{ raw.fallbackReason }}</span>
    </p>
    <p v-if="changedByUser" class="mt-2 text-xs font-medium text-st-work">
      ✏️ {{ t('admin.ai.userChanged') }}
    </p>
    <p v-else-if="confirmedByUser" class="mt-2 text-xs font-medium text-st-done">
      ✓ {{ t('admin.ai.userConfirmed') }}
    </p>
  </section>
</template>
