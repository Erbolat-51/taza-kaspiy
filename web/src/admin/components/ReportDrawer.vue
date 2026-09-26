<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { adminApi, apiError } from '../api';
import { useAdmin } from '../store';
import type { AdminDetails } from '../types';
import type { ReportEvent, ReportStatus } from '../../types';
import { CATEGORY_EMOJI, GROUP_COLOR, statusGroup } from '../../lib/meta';
import { formatDuration } from '../../lib/format';
import BeforeAfter from '../../components/BeforeAfter.vue';
import AiExplain from './AiExplain.vue';
import MiniMap from './MiniMap.vue';

const store = useAdmin();
const { t, locale } = useI18n();

const d = ref<AdminDetails | null>(null);
const busy = ref(false);
const executorId = ref<number | ''>('');
const rejecting = ref(false);
const reason = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

async function fetchDetails(id: number) {
  try {
    d.value = await adminApi.report(id);
    executorId.value = d.value.executorId ?? '';
  } catch (e) {
    store.notify(t('admin.drawer.error', { msg: apiError(e) }), 'error');
    store.selectedId = null;
  }
}

watch(
  () => store.selectedId,
  (id) => {
    rejecting.value = false;
    reason.value = '';
    d.value = null;
    if (id !== null) void fetchDetails(id);
  },
  { immediate: true },
);

// Изменения по сокету (бот, исполнитель, другая админка) — перечитываем историю
const live = computed(() => store.reports.find((r) => r.id === store.selectedId));
watch(
  () =>
    live.value &&
    `${live.value.status}|${live.value.executorId}|${live.value.afterPhoto}|${live.value.category}|${live.value.duplicatesCount}`,
  (now, before) => {
    if (before && now !== before && store.selectedId !== null) void fetchDetails(store.selectedId);
  },
);

const group = computed(() => (d.value ? statusGroup(d.value.status) : 'new'));
const isOpen = computed(() => d.value && !['RESOLVED', 'REJECTED'].includes(d.value.status));
const name = (o: { nameKk: string; nameRu: string }) =>
  locale.value === 'kk' ? o.nameKk : o.nameRu;
const selectedExecutor = computed(() => store.executors.find((e) => e.id === executorId.value));
const changedByUser = computed(
  () =>
    d.value?.events.some(
      (e) => e.type === 'COMMENT' && e.payload.kind === 'category' && e.payload.confirmed === false,
    ) ?? false,
);

async function run(action: () => Promise<unknown>, success?: string) {
  if (!d.value) return;
  busy.value = true;
  try {
    const updated = (await action()) as Parameters<typeof store.upsert>[0];
    if (updated) store.upsert(updated);
    await fetchDetails(d.value.id);
    store.notify(success ?? t('admin.drawer.saved'));
  } catch (e) {
    store.notify(t('admin.drawer.error', { msg: apiError(e) }), 'error');
  } finally {
    busy.value = false;
  }
}

const setStatus = (s: ReportStatus) => run(() => adminApi.setStatus(d.value!.id, s));

function assign() {
  const ex = selectedExecutor.value;
  if (!ex) return;
  void run(
    () => adminApi.assign(d.value!.id, ex.id),
    t(ex.linked ? 'admin.drawer.assigned' : 'admin.drawer.assignedNoTg', { name: name(ex) }),
  );
}

function onAfterPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  void run(() => adminApi.afterPhoto(d.value!.id, file), t('admin.drawer.resolved'));
  (e.target as HTMLInputElement).value = '';
}

function reject() {
  if (!reason.value.trim()) return;
  void run(() => adminApi.setStatus(d.value!.id, 'REJECTED', reason.value.trim())).then(() => {
    rejecting.value = false;
    reason.value = '';
  });
}

function actorLabel(actor: string) {
  const [role, rest] = actor.split(':');
  if (role === 'admin') return rest ?? 'admin';
  if (role === 'tg' || role === 'bot') {
    const a = d.value?.tgUser;
    return a
      ? a.username
        ? `@${a.username}`
        : (a.firstName ?? t('actor.resident'))
      : t('actor.resident');
  }
  if (role === 'executor') return t('actor.executor');
  return t(`actor.${role}`);
}

function eventText(e: ReportEvent) {
  const p = e.payload as Record<string, string | boolean | undefined>;
  switch (e.type) {
    case 'AI_CLASSIFIED':
      return `${t('event.AI_CLASSIFIED', { cat: t(`category.${p.category}`) })} · ${p.provider ?? ''}`;
    case 'STATUS_CHANGED':
      return t('event.STATUS_CHANGED', { status: t(`status.${p.to}`) });
    case 'ASSIGNED':
      return t('event.ASSIGNED', {
        name: (locale.value === 'kk' ? p.executorNameKk : p.executorNameRu) ?? '',
      });
    case 'COMMENT':
      if (p.kind === 'category') {
        return p.confirmed
          ? t('event.CATEGORY_OK')
          : t('event.CATEGORY', { cat: t(`category.${p.to}`) });
      }
      return t('event.COMMENT');
    default:
      return t(`event.${e.type}`);
  }
}

const close = () => (store.selectedId = null);
</script>

<template>
  <div class="fixed inset-0 z-[1000] flex justify-end" @keydown.esc="close">
    <div class="absolute inset-0 bg-caspian/30" @click="close" />
    <aside
      class="relative flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="d?.code ?? ''"
    >
      <header class="flex items-center justify-between gap-2 border-b border-sand-2 px-5 py-3">
        <div v-if="d" class="flex flex-wrap items-center gap-2">
          <span class="font-display text-xl font-bold">{{ d.code }}</span>
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            :style="{ background: GROUP_COLOR[group] }"
          >
            {{ t(`status.${d.status}`) }}
          </span>
          <span v-if="d.isDemo" class="rounded-full bg-sand px-2 py-0.5 text-xs text-muted"
            >demo</span
          >
        </div>
        <span v-else class="text-sm text-muted">{{ t('app.loading') }}</span>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-full text-2xl text-muted hover:bg-sand"
          :aria-label="t('card.close')"
          @click="close"
        >
          ×
        </button>
      </header>

      <div v-if="d" class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <BeforeAfter v-if="d.afterPhoto" :before="d.photo" :after="d.afterPhoto" />
        <a v-else :href="d.photo" target="_blank" rel="noopener">
          <img
            :src="d.photo"
            alt=""
            class="aspect-[4/3] w-full rounded-xl bg-sand-2 object-cover"
          />
        </a>

        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-display text-lg font-bold">
              {{ CATEGORY_EMOJI[d.category] }} {{ t(`category.${d.category}`) }}
            </p>
            <p class="text-sm text-muted">📍 {{ d.zone ? name(d.zone) : t('card.noZone') }}</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-muted">{{ t('card.severity') }}</p>
            <p
              class="font-display text-2xl font-bold"
              :class="d.severity >= 4 ? 'text-st-new' : 'text-st-work'"
            >
              {{ d.severity }}/5
            </p>
          </div>
        </div>

        <!-- Действия -->
        <section class="space-y-3 rounded-xl border-2 border-teal/20 p-3">
          <h3 class="text-xs font-semibold tracking-wide text-muted uppercase">
            {{ t('admin.drawer.actions') }}
          </h3>

          <template v-if="isOpen">
            <div>
              <label class="mb-1 block text-xs text-muted" for="executor">{{
                t('admin.drawer.assign')
              }}</label>
              <div class="flex gap-2">
                <select
                  id="executor"
                  v-model="executorId"
                  class="min-w-0 flex-1 rounded-lg border border-sand-2 bg-white px-2 py-2 text-sm"
                >
                  <option value="" disabled>{{ t('admin.drawer.chooseExecutor') }}</option>
                  <option v-for="e in store.executors" :key="e.id" :value="e.id">
                    {{ name(e) }} {{ e.linked ? '📱' : '' }} ({{ e.activeTasks }})
                  </option>
                </select>
                <button
                  type="button"
                  class="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  :disabled="busy || !executorId || executorId === d.executorId"
                  @click="assign"
                >
                  {{ d.executorId ? t('admin.drawer.reassignBtn') : t('admin.drawer.assignBtn') }}
                </button>
              </div>
              <p
                v-if="selectedExecutor"
                class="mt-1 text-xs"
                :class="selectedExecutor.linked ? 'text-st-done' : 'text-muted'"
              >
                {{
                  selectedExecutor.linked
                    ? '📱 ' + t('admin.drawer.linkedTg')
                    : t('admin.drawer.notLinkedTg')
                }}
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-if="d.status === 'NEW'"
                type="button"
                class="btn"
                :disabled="busy"
                @click="setStatus('CONFIRMED')"
              >
                ☑️ {{ t('admin.drawer.confirm') }}
              </button>
              <button
                v-if="d.status !== 'IN_PROGRESS'"
                type="button"
                class="btn"
                :disabled="busy"
                @click="setStatus('IN_PROGRESS')"
              >
                🚧 {{ t('admin.drawer.start') }}
              </button>
              <button type="button" class="btn" :disabled="busy" @click="setStatus('RESOLVED')">
                ✅ {{ t('admin.drawer.resolve') }}
              </button>
            </div>

            <div>
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onAfterPhoto"
              />
              <button
                type="button"
                class="w-full rounded-lg bg-st-done px-3 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                :disabled="busy"
                @click="fileInput?.click()"
              >
                📷 {{ t('admin.drawer.afterPhoto') }}
              </button>
              <p class="mt-1 text-xs text-muted">{{ t('admin.drawer.afterPhotoHint') }}</p>
            </div>

            <div v-if="!rejecting">
              <button
                type="button"
                class="text-sm font-medium text-st-new hover:underline"
                @click="rejecting = true"
              >
                ❌ {{ t('admin.drawer.reject') }}
              </button>
            </div>
            <div v-else class="space-y-2 rounded-lg bg-st-new/5 p-2">
              <label class="block text-xs font-medium" for="reason">{{
                t('admin.drawer.rejectReason')
              }}</label>
              <textarea
                id="reason"
                v-model="reason"
                rows="2"
                maxlength="500"
                class="w-full rounded-lg border border-sand-2 p-2 text-sm"
                :placeholder="t('admin.drawer.rejectPlaceholder')"
              />
              <div class="flex justify-end gap-2">
                <button type="button" class="btn" @click="rejecting = false">
                  {{ t('admin.drawer.cancel') }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-st-new px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                  :disabled="busy || !reason.trim()"
                  @click="reject"
                >
                  {{ t('admin.drawer.rejectConfirm') }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <p v-if="d.resolvedAt" class="text-sm">
              {{ t('card.resolvedIn') }}:
              <b class="text-st-done">{{ formatDuration(d.createdAt, d.resolvedAt) }}</b>
            </p>
            <p v-if="d.rejectReason" class="text-sm">
              {{ t('card.reason') }}: {{ d.rejectReason }}
            </p>
            <button type="button" class="btn" :disabled="busy" @click="setStatus('NEW')">
              ↩ {{ t('admin.drawer.reopen') }}
            </button>
          </template>
        </section>

        <AiExplain
          :ai-raw="d.aiRaw"
          :category="d.category"
          :confidence="d.aiConfidence"
          :confirmed-by-user="d.categoryConfirmedByUser"
          :changed-by-user="changedByUser"
        />

        <div v-if="d.comment" class="rounded-xl border border-sand-2 p-3">
          <p class="mb-1 text-xs text-muted">💬 {{ t('card.comment') }}</p>
          <p class="text-sm">{{ d.comment }}</p>
        </div>

        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt class="text-xs text-muted">{{ t('card.reported') }}</dt>
            <dd>{{ dayjs(d.createdAt).format('DD.MM.YYYY HH:mm') }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('admin.drawer.author') }}</dt>
            <dd>
              <template v-if="d.tgUser"
                >📱 {{ d.tgUser.username ? '@' + d.tgUser.username : d.tgUser.firstName }}</template
              >
              <template v-else>{{ t('admin.drawer.viaWeb') }}</template>
            </dd>
          </div>
          <div v-if="d.executor">
            <dt class="text-xs text-muted">{{ t('card.executor') }}</dt>
            <dd>{{ name(d.executor) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('admin.drawer.location') }}</dt>
            <dd class="font-mono text-xs">{{ d.lat.toFixed(5) }}, {{ d.lng.toFixed(5) }}</dd>
          </div>
        </dl>

        <MiniMap :lat="d.lat" :lng="d.lng" :color="GROUP_COLOR[group]" />
        <a
          :href="`/?r=${d.id}`"
          target="_blank"
          class="text-sm font-medium text-teal hover:underline"
          >🗺 {{ t('admin.drawer.openMap') }} ↗</a
        >

        <section v-if="d.duplicates.length">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {{ t('admin.drawer.duplicates', { n: d.duplicates.length }) }}
          </h3>
          <div class="flex gap-2 overflow-x-auto">
            <figure v-for="dup in d.duplicates" :key="dup.id" class="w-24 shrink-0">
              <img :src="dup.photoThumb" alt="" class="h-20 w-24 rounded-lg object-cover" />
              <figcaption class="mt-0.5 text-xs text-muted">{{ dup.code }}</figcaption>
            </figure>
          </div>
        </section>

        <section>
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {{ t('admin.drawer.history') }}
          </h3>
          <ol class="ml-1.5 space-y-2.5 border-l-2 border-sand-2 pl-4">
            <li v-for="e in d.events" :key="e.id" class="relative">
              <span
                class="absolute top-1.5 -left-[22px] h-2.5 w-2.5 rounded-full bg-teal ring-2 ring-white"
              />
              <p class="text-sm">{{ eventText(e) }}</p>
              <p class="text-xs text-muted">
                {{ dayjs(e.createdAt).format('DD.MM HH:mm') }} · {{ actorLabel(e.actor) }}
                <template v-if="(e.payload as { reason?: string }).reason">
                  · «{{ (e.payload as { reason?: string }).reason }}»</template
                >
              </p>
            </li>
          </ol>
        </section>
      </div>
    </aside>
  </div>
</template>
