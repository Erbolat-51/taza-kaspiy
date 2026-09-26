<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { useAdmin } from '../store';
import type { AdminReport } from '../types';
import { CATEGORY_EMOJI, GROUP_COLOR, statusGroup } from '../../lib/meta';

const props = defineProps<{ items: AdminReport[] }>();
const store = useAdmin();
const { t, locale } = useI18n();

type SortKey = 'createdAt' | 'severity' | 'code';
const sortKey = ref<SortKey>('createdAt');
const desc = ref(true);

const sorted = computed(() => {
  const k = sortKey.value;
  const dir = desc.value ? -1 : 1;
  return [...props.items].sort((a, b) => {
    const va = k === 'createdAt' ? Date.parse(a.createdAt) : k === 'severity' ? a.severity : a.id;
    const vb = k === 'createdAt' ? Date.parse(b.createdAt) : k === 'severity' ? b.severity : b.id;
    return (va - vb) * dir;
  });
});

function sortBy(k: SortKey) {
  if (sortKey.value === k) desc.value = !desc.value;
  else {
    sortKey.value = k;
    desc.value = true;
  }
}
const arrow = (k: SortKey) => (sortKey.value === k ? (desc.value ? '↓' : '↑') : '');
const name = (o: { nameKk: string; nameRu: string } | null) =>
  o ? (locale.value === 'kk' ? o.nameKk : o.nameRu) : '—';
</script>

<template>
  <div class="h-full overflow-auto rounded-2xl bg-white shadow-sm">
    <table class="w-full text-left text-sm">
      <thead class="sticky top-0 bg-sand text-xs text-muted uppercase">
        <tr>
          <th class="px-3 py-2.5">
            <button type="button" @click="sortBy('code')">
              {{ t('admin.table.code') }} {{ arrow('code') }}
            </button>
          </th>
          <th class="px-3 py-2.5">{{ t('admin.table.category') }}</th>
          <th class="px-3 py-2.5">
            <button type="button" @click="sortBy('severity')">
              {{ t('admin.table.severity') }} {{ arrow('severity') }}
            </button>
          </th>
          <th class="px-3 py-2.5">{{ t('admin.table.zone') }}</th>
          <th class="px-3 py-2.5">{{ t('admin.table.status') }}</th>
          <th class="px-3 py-2.5">{{ t('admin.table.executor') }}</th>
          <th class="px-3 py-2.5">{{ t('admin.table.ai') }}</th>
          <th class="px-3 py-2.5">
            <button type="button" @click="sortBy('createdAt')">
              {{ t('admin.table.created') }} {{ arrow('createdAt') }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in sorted"
          :key="r.id"
          class="cursor-pointer border-t border-sand-2 hover:bg-sand/60"
          :class="store.fresh.has(r.id) ? 'bg-st-new/5' : ''"
          tabindex="0"
          @click="store.selectedId = r.id"
          @keydown.enter="store.selectedId = r.id"
        >
          <td class="px-3 py-2 font-semibold whitespace-nowrap">
            {{ r.code
            }}<span v-if="r.duplicatesCount" class="ml-1 text-xs text-muted"
              >×{{ r.duplicatesCount + 1 }}</span
            >
          </td>
          <td class="px-3 py-2 whitespace-nowrap">
            {{ CATEGORY_EMOJI[r.category] }} {{ t(`category.${r.category}`) }}
          </td>
          <td class="px-3 py-2 font-semibold" :class="r.severity >= 4 ? 'text-st-new' : ''">
            {{ r.severity }}
          </td>
          <td class="px-3 py-2">{{ name(r.zone) }}</td>
          <td class="px-3 py-2 whitespace-nowrap">
            <span class="inline-flex items-center gap-1.5">
              <span
                class="h-2 w-2 rounded-full"
                :style="{ background: GROUP_COLOR[statusGroup(r.status)] }"
              />
              {{ t(`status.${r.status}`) }}
            </span>
          </td>
          <td class="px-3 py-2">{{ name(r.executor) }}</td>
          <td class="px-3 py-2 text-xs">
            <template v-if="r.aiProvider && r.aiProvider !== 'mock'"
              >{{ Math.round(r.aiConfidence * 100) }}%</template
            >
            <template v-else>—</template>
          </td>
          <td class="px-3 py-2 whitespace-nowrap text-muted">
            {{ dayjs(r.createdAt).format('DD.MM HH:mm') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
