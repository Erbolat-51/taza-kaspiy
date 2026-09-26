<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { http, api } from '../../api';
import { apiError } from '../api';
import { getSocket } from '../../lib/socket';
import { useAdmin } from '../store';
import type { Zone } from '../../types';

interface Cleanup {
  id: number;
  title: string;
  startsAt: string;
  meetingPoint: string;
  maxVolunteers: number;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  zone: { id: number; nameKk: string; nameRu: string };
  signups: {
    createdAt: string;
    tgUser: { id: number; firstName: string | null; username: string | null };
  }[];
}

const store = useAdmin();
const { t, locale } = useI18n();
const cleanups = ref<Cleanup[]>([]);
const zones = ref<Zone[]>([]);
const busy = ref(false);
const open = ref<number | null>(null);

const tomorrow10 = dayjs().add(1, 'day').hour(10).minute(0).format('YYYY-MM-DDTHH:mm');
const form = reactive({
  title: '',
  zoneId: '' as number | '',
  startsAt: tomorrow10,
  meetingPoint: '',
  max: 30,
});

const load = async () => {
  cleanups.value = (await http.get<Cleanup[]>('/admin/cleanups')).data;
};

const upcoming = computed(() =>
  cleanups.value
    .filter((c) => c.status === 'PLANNED' && dayjs(c.startsAt).isAfter(dayjs().subtract(1, 'day')))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
);
const past = computed(() => cleanups.value.filter((c) => !upcoming.value.includes(c)));

async function create() {
  if (!form.zoneId) return;
  busy.value = true;
  try {
    await http.post('/admin/cleanups', {
      title: form.title,
      zoneId: form.zoneId,
      // datetime-local — время браузера (Актау), отправляем в ISO
      startsAt: new Date(form.startsAt).toISOString(),
      meetingPoint: form.meetingPoint,
      maxVolunteers: form.max,
    });
    form.title = '';
    form.meetingPoint = '';
    store.notify(t('admin.cleanups.created'));
    await load();
  } catch (e) {
    store.notify(t('admin.drawer.error', { msg: apiError(e) }), 'error');
  } finally {
    busy.value = false;
  }
}

async function setStatus(c: Cleanup, status: Cleanup['status']) {
  try {
    await http.patch(`/admin/cleanups/${c.id}`, { status });
    await load();
  } catch (e) {
    store.notify(t('admin.drawer.error', { msg: apiError(e) }), 'error');
  }
}

const name = (o: { nameKk: string; nameRu: string }) =>
  locale.value === 'kk' ? o.nameKk : o.nameRu;
const onLive = () => void load().catch(() => {});

onMounted(async () => {
  const [, z] = await Promise.all([load(), api.zones()]);
  zones.value = z;
  getSocket().on('cleanup:updated', onLive);
});
onBeforeUnmount(() => getSocket().off('cleanup:updated', onLive));
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <h1 class="mb-4 font-display text-2xl font-bold">{{ t('admin.cleanups.title') }}</h1>

    <div class="grid gap-4 xl:grid-cols-[380px_1fr]">
      <!-- Создание -->
      <form class="h-fit space-y-3 rounded-2xl bg-white p-4 shadow-sm" @submit.prevent="create">
        <h2 class="font-semibold">🧹 {{ t('admin.cleanups.create') }}</h2>
        <label class="block text-sm">
          <span class="mb-1 block text-xs text-muted">{{ t('admin.cleanups.name') }}</span>
          <input
            v-model="form.title"
            required
            minlength="3"
            maxlength="120"
            class="w-full rounded-lg border border-sand-2 px-3 py-2"
            :placeholder="t('admin.cleanups.namePlaceholder')"
          />
        </label>
        <label class="block text-sm">
          <span class="mb-1 block text-xs text-muted">{{ t('admin.cleanups.zone') }}</span>
          <select
            v-model="form.zoneId"
            required
            class="w-full rounded-lg border border-sand-2 bg-white px-2 py-2"
          >
            <option value="" disabled>—</option>
            <option v-for="z in zones" :key="z.id" :value="z.id">
              {{ name(z) }} · {{ Math.round(z.cleanIndex) }}
            </option>
          </select>
        </label>
        <div class="grid grid-cols-[1fr_100px] gap-2">
          <label class="block text-sm">
            <span class="mb-1 block text-xs text-muted">{{ t('admin.cleanups.startsAt') }}</span>
            <input
              v-model="form.startsAt"
              type="datetime-local"
              required
              class="w-full rounded-lg border border-sand-2 px-2 py-2"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-xs text-muted">{{ t('admin.cleanups.max') }}</span>
            <input
              v-model.number="form.max"
              type="number"
              min="1"
              max="1000"
              class="w-full rounded-lg border border-sand-2 px-2 py-2"
            />
          </label>
        </div>
        <label class="block text-sm">
          <span class="mb-1 block text-xs text-muted">{{ t('admin.cleanups.meetingPoint') }}</span>
          <input
            v-model="form.meetingPoint"
            required
            minlength="2"
            maxlength="200"
            class="w-full rounded-lg border border-sand-2 px-3 py-2"
            :placeholder="t('admin.cleanups.meetingPlaceholder')"
          />
        </label>
        <button
          type="submit"
          class="w-full rounded-lg bg-teal py-2.5 font-semibold text-white disabled:opacity-50"
          :disabled="busy"
        >
          📣 {{ t('admin.cleanups.submit') }}
        </button>
      </form>

      <!-- Списки -->
      <div class="space-y-5">
        <section
          v-for="group in [
            { key: 'upcoming', items: upcoming },
            { key: 'past', items: past },
          ]"
          :key="group.key"
        >
          <h2 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {{ t(`admin.cleanups.${group.key}`) }}
          </h2>
          <p v-if="!group.items.length" class="rounded-2xl bg-white p-4 text-sm text-muted">
            {{ t('admin.cleanups.empty') }}
          </p>
          <article
            v-for="c in group.items"
            :key="c.id"
            class="mb-2 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 class="font-semibold">{{ c.title }}</h3>
                <p class="text-sm text-muted">
                  🗓 {{ dayjs(c.startsAt).format('DD.MM.YYYY HH:mm') }} · 📍 {{ name(c.zone) }} —
                  {{ c.meetingPoint }}
                </p>
              </div>
              <span class="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium">{{
                t(`admin.cleanups.status.${c.status}`)
              }}</span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="flex items-center gap-2 text-sm font-medium"
                :aria-expanded="open === c.id"
                @click="open = open === c.id ? null : c.id"
              >
                <span class="h-2 w-24 overflow-hidden rounded-full bg-sand">
                  <span
                    class="block h-full rounded-full bg-teal"
                    :style="{
                      width: `${Math.min(100, (c.signups.length / c.maxVolunteers) * 100)}%`,
                    }"
                  />
                </span>
                👥 {{ t('admin.cleanups.signups', { n: c.signups.length, max: c.maxVolunteers }) }}
                {{ open === c.id ? '▴' : '▾' }}
              </button>
              <template v-if="c.status === 'PLANNED'">
                <button type="button" class="btn ml-auto" @click="setStatus(c, 'DONE')">
                  ✅ {{ t('admin.cleanups.markDone') }}
                </button>
                <button type="button" class="btn" @click="setStatus(c, 'CANCELLED')">
                  ✕ {{ t('admin.cleanups.cancel') }}
                </button>
              </template>
            </div>
            <ul
              v-if="open === c.id"
              class="mt-3 grid gap-1 border-t border-sand-2 pt-3 text-sm sm:grid-cols-2"
            >
              <li v-if="!c.signups.length" class="text-muted">
                {{ t('admin.cleanups.noSignups') }}
              </li>
              <li v-for="s in c.signups" :key="s.tgUser.id">
                🙋 {{ s.tgUser.firstName ?? '—'
                }}<span v-if="s.tgUser.username" class="text-muted"> @{{ s.tgUser.username }}</span>
                <span class="text-xs text-muted">
                  · {{ dayjs(s.createdAt).format('DD.MM HH:mm') }}</span
                >
              </li>
            </ul>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>
