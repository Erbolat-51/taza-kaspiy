<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAdmin } from '../store';
import { CATEGORIES, CATEGORY_EMOJI } from '../../lib/meta';
import type { Category } from '../../types';
import KanbanBoard from '../components/KanbanBoard.vue';
import ReportTable from '../components/ReportTable.vue';

const store = useAdmin();
const { t } = useI18n();

const readView = () => {
  try {
    return localStorage.getItem('taza-admin-view') === 'table' ? 'table' : 'kanban';
  } catch {
    return 'kanban';
  }
};
const view = ref<'kanban' | 'table'>(readView());
watch(view, (v) => {
  try {
    localStorage.setItem('taza-admin-view', v);
  } catch {
    /* не критично */
  }
});

const q = ref('');
const category = ref<Category | ''>('');
const showRejected = ref(false);

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return store.reports.filter((r) => {
    if (category.value && r.category !== category.value) return false;
    if (view.value === 'table' && !showRejected.value && r.status === 'REJECTED') return false;
    if (!s) return true;
    return [r.code, r.zone?.nameKk, r.zone?.nameRu, r.comment]
      .filter(Boolean)
      .some((x) => x!.toLowerCase().includes(s));
  });
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-3 md:p-4">
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-lg bg-white p-0.5 shadow-sm" role="group">
        <button
          v-for="v in ['kanban', 'table'] as const"
          :key="v"
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium"
          :class="view === v ? 'bg-caspian text-white' : 'text-muted hover:text-caspian'"
          :aria-pressed="view === v"
          @click="view = v"
        >
          {{ v === 'kanban' ? '▦' : '☰' }} {{ t(`admin.view.${v}`) }}
        </button>
      </div>
      <input
        v-model="q"
        type="search"
        :placeholder="t('admin.search')"
        class="min-w-0 flex-1 rounded-lg border border-sand-2 bg-white px-3 py-2 text-sm sm:max-w-xs"
      />
      <select v-model="category" class="rounded-lg border border-sand-2 bg-white px-2 py-2 text-sm">
        <option value="">{{ t('filters.categories') }}: {{ t('filters.statusAll') }}</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">
          {{ CATEGORY_EMOJI[c] }} {{ t(`category.${c}`) }}
        </option>
      </select>
      <label class="flex items-center gap-1.5 text-sm">
        <input v-model="showRejected" type="checkbox" class="accent-teal" />
        {{ t('admin.showRejected') }}
      </label>
      <span v-if="store.loading" class="text-sm text-muted">{{ t('app.loading') }}</span>
    </div>

    <div class="min-h-0 flex-1">
      <KanbanBoard v-if="view === 'kanban'" :items="filtered" :show-rejected="showRejected" />
      <ReportTable v-else :items="filtered" />
    </div>
  </div>
</template>
