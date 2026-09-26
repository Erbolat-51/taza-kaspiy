<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, http } from '../api';
import { CATEGORY_EMOJI } from '../lib/meta';
import { botUrl } from '../lib/format';
import type { Report, Zone } from '../types';
import PublicHeader from '../components/PublicHeader.vue';
import PickMap from '../components/PickMap.vue';

const { t, locale } = useI18n();

const zones = ref<Zone[]>([]);
const file = ref<Blob | null>(null);
const preview = ref<string | null>(null);
const point = ref<{ lat: number; lng: number } | null>(null);
const zoneHint = ref<{ nameKk: string; nameRu: string } | null | undefined>(undefined);
const comment = ref('');
const locating = ref(false);
const sending = ref(false);
const error = ref<string | null>(null);
const notPollution = ref<{ summaryKk?: string; summaryRu?: string } | null>(null);
const result = ref<{ report: Report; duplicateOf: { code: string } | null } | null>(null);
const input = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  zones.value = await api.zones().catch(() => []);
});
onBeforeUnmount(() => preview.value && URL.revokeObjectURL(preview.value));

/**
 * Фото с телефона бывают 5–10 МБ; сжимаем до 2000px JPEG прямо в браузере —
 * через туннель и мобильный интернет отправка в разы быстрее. Сервер всё равно ресайзит.
 */
async function shrink(f: File): Promise<Blob> {
  if (f.size < 1.5 * 1024 * 1024 || !f.type.startsWith('image/')) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? f), 'image/jpeg', 0.85));
  } catch {
    return f; // HEIC и т.п. — отправим как есть, сервер разберётся
  }
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  error.value = null;
  notPollution.value = null;
  file.value = await shrink(f);
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(file.value);
}

function locate() {
  if (!navigator.geolocation) {
    error.value = t('form.geoError');
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      locating.value = false;
      point.value = { lat: p.coords.latitude, lng: p.coords.longitude };
    },
    () => {
      locating.value = false;
      error.value = t('form.geoError');
    },
    { enableHighAccuracy: true, timeout: 10_000 },
  );
}

// Подсказка «какой участок» — до отправки, чтобы житель видел, куда попадёт точка
watch(point, async (p) => {
  zoneHint.value = undefined;
  if (!p) return;
  zoneHint.value =
    (await http
      .get('/zones/lookup', { params: p })
      .then((r) => r.data)
      .catch(() => null)) ?? null;
});

const zoneName = computed(() =>
  zoneHint.value ? (locale.value === 'kk' ? zoneHint.value.nameKk : zoneHint.value.nameRu) : null,
);

async function submit() {
  error.value = null;
  notPollution.value = null;
  if (!file.value) return (error.value = t('form.needPhoto'));
  if (!point.value) return (error.value = t('form.needPlace'));
  sending.value = true;
  try {
    const fd = new FormData();
    fd.set('photo', file.value, 'photo.jpg');
    fd.set('lat', String(point.value.lat));
    fd.set('lng', String(point.value.lng));
    if (comment.value.trim()) fd.set('comment', comment.value.trim());
    const { data } = await http.post('/reports', fd, { timeout: 60_000 });
    result.value = data;
  } catch (e) {
    const res = (e as { response?: { status: number; data?: Record<string, string> } }).response;
    if (res?.status === 422 && res.data?.error === 'NOT_POLLUTION') notPollution.value = res.data;
    else if (res?.status === 413) error.value = t('form.errTooBig');
    else if (res?.status === 429) error.value = t('form.errRate');
    else error.value = res?.data?.message ?? t('form.errGeneric');
  } finally {
    sending.value = false;
  }
}

function reset() {
  result.value = null;
  file.value = null;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = null;
  comment.value = '';
  notPollution.value = null;
}
</script>

<template>
  <div class="min-h-full bg-sand">
    <PublicHeader />
    <main class="mx-auto max-w-2xl px-4 py-6">
      <!-- Успех -->
      <section v-if="result" class="card space-y-4 p-6 text-center">
        <p class="text-5xl" aria-hidden="true">✅</p>
        <h1 class="font-display text-2xl font-bold">{{ t('form.successTitle') }}</h1>
        <p class="font-display text-3xl font-extrabold text-teal">{{ result.report.code }}</p>
        <p class="text-sm">
          {{ CATEGORY_EMOJI[result.report.category] }}
          {{
            t('form.ai', {
              cat: t(`category.${result.report.category}`),
              sev: result.report.severity,
            })
          }}
        </p>
        <p v-if="result.report.zone" class="text-sm text-muted">
          📍 {{ locale === 'kk' ? result.report.zone.nameKk : result.report.zone.nameRu }}
        </p>
        <p v-if="result.duplicateOf" class="rounded-lg bg-sand px-3 py-2 text-sm">
          ℹ️ {{ t('form.duplicate', { code: result.duplicateOf.code }) }}
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <RouterLink
            :to="{ path: '/', query: { r: result.report.parentId ?? result.report.id } }"
            class="rounded-lg bg-teal px-4 py-2.5 font-semibold text-white"
          >
            🗺 {{ t('form.openMap') }}
          </RouterLink>
          <button type="button" class="btn !py-2.5" @click="reset">
            📸 {{ t('form.another') }}
          </button>
        </div>
        <a
          :href="botUrl"
          target="_blank"
          rel="noopener"
          class="block text-sm text-teal hover:underline"
          >{{ t('form.viaBot') }}</a
        >
      </section>

      <!-- Форма -->
      <form v-else class="space-y-5" @submit.prevent="submit">
        <div>
          <h1 class="font-display text-2xl font-extrabold md:text-3xl">{{ t('form.title') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ t('form.subtitle') }}</p>
        </div>

        <section class="card p-4">
          <h2 class="mb-2 text-sm font-semibold">1. {{ t('form.photo') }}</h2>
          <input
            ref="input"
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            @change="onFile"
          />
          <button
            v-if="!preview"
            type="button"
            class="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-sand-2 text-muted hover:border-teal hover:text-teal"
            @click="input?.click()"
          >
            <span class="text-3xl" aria-hidden="true">📷</span>
            <span class="font-medium">{{ t('form.choosePhoto') }}</span>
            <span class="text-xs">{{ t('form.photoHint') }}</span>
          </button>
          <div v-else class="relative">
            <img :src="preview" alt="" class="max-h-72 w-full rounded-xl object-cover" />
            <button type="button" class="btn absolute top-2 right-2" @click="input?.click()">
              🔄 {{ t('form.change') }}
            </button>
          </div>
          <!-- 422: ИИ не увидел загрязнения -->
          <div
            v-if="notPollution"
            class="mt-3 rounded-xl border border-st-work/40 bg-st-work/10 p-3 text-sm"
            role="alert"
          >
            <p class="font-semibold">🤔 {{ t('form.notPollution') }}</p>
            <p v-if="notPollution.summaryKk" class="mt-1 text-muted">
              🤖 {{ locale === 'kk' ? notPollution.summaryKk : notPollution.summaryRu }}
            </p>
            <p class="mt-1">{{ t('form.notPollutionHint') }}</p>
          </div>
        </section>

        <section class="card p-4">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold">2. {{ t('form.place') }}</h2>
            <button type="button" class="btn" :disabled="locating" @click="locate">
              {{ locating ? t('form.locating') : t('form.myLocation') }}
            </button>
          </div>
          <p class="mb-2 text-xs text-muted">{{ t('form.placeHint') }}</p>
          <PickMap :point="point" :zones="zones" @pick="(p) => (point = p)" />
          <p v-if="point" class="mt-2 text-sm">
            <template v-if="zoneName">📍 {{ t('form.zone', { z: zoneName }) }}</template>
            <template v-else-if="zoneHint === null"
              ><span class="text-st-work">⚠ {{ t('form.outside') }}</span></template
            >
            <span class="ml-1 font-mono text-xs text-muted"
              >{{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}</span
            >
          </p>
        </section>

        <section class="card p-4">
          <label class="mb-2 block text-sm font-semibold" for="comment"
            >3. {{ t('form.comment') }}</label
          >
          <textarea
            id="comment"
            v-model="comment"
            rows="2"
            maxlength="1000"
            class="w-full rounded-lg border border-sand-2 p-2 text-sm"
            :placeholder="t('form.commentPlaceholder')"
          />
        </section>

        <p v-if="error" class="rounded-lg bg-st-new/10 px-3 py-2 text-sm text-st-new" role="alert">
          {{ error }}
        </p>

        <button
          type="submit"
          class="w-full rounded-xl bg-teal py-3.5 text-lg font-semibold text-white shadow-sm disabled:opacity-60"
          :disabled="sending"
        >
          {{ sending ? '⏳ ' + t('form.sending') : '📤 ' + t('form.submit') }}
        </button>
        <a
          :href="botUrl"
          target="_blank"
          rel="noopener"
          class="block text-center text-sm text-teal hover:underline"
          >{{ t('form.viaBot') }}</a
        >
      </form>
    </main>
  </div>
</template>
