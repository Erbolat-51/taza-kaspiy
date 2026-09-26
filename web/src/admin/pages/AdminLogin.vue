<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../auth';
import LangSwitch from '../../components/LangSwitch.vue';

const auth = useAuth();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
/**
 * Демо-логин — только в dev. В прод-сборке DEV=false, и сборщик выкидывает строку целиком:
 * админка открыта в интернет, а пароль там сгенерированный.
 */
const devHint = import.meta.env.DEV ? 'Демо: admin@taza.kz / admin123' : '';

const email = ref('');
const password = ref('');
const error = ref(false);
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = false;
  try {
    await auth.login(email.value.trim(), password.value);
    const next = typeof route.query.next === 'string' ? route.query.next : '/admin';
    await router.replace(next.startsWith('/admin') ? next : '/admin');
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-full place-items-center bg-caspian p-4">
    <form class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" @submit.prevent="submit">
      <div class="mb-5 flex items-start justify-between">
        <div class="flex items-center gap-3">
          <img src="/favicon.svg" alt="" class="h-11 w-11 rounded-xl" />
          <div>
            <h1 class="font-display text-xl font-extrabold">{{ t('admin.login.title') }}</h1>
            <p class="text-xs text-muted">{{ t('admin.login.subtitle') }}</p>
          </div>
        </div>
        <LangSwitch />
      </div>

      <label class="mb-1 block text-sm font-medium" for="email">{{ t('admin.login.email') }}</label>
      <input
        id="email"
        v-model="email"
        type="email"
        autocomplete="username"
        required
        class="mb-3 w-full rounded-lg border border-sand-2 px-3 py-2"
      />
      <label class="mb-1 block text-sm font-medium" for="password">{{
        t('admin.login.password')
      }}</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        class="mb-4 w-full rounded-lg border border-sand-2 px-3 py-2"
      />
      <p v-if="error" class="mb-3 text-sm text-st-new" role="alert">{{ t('admin.login.error') }}</p>
      <button
        type="submit"
        class="w-full rounded-lg bg-teal py-2.5 font-semibold text-white disabled:opacity-50"
        :disabled="busy"
      >
        {{ t('admin.login.submit') }}
      </button>
      <p v-if="devHint" class="mt-4 text-center text-xs text-muted">{{ devHint }}</p>
    </form>
  </main>
</template>
