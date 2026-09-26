<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../auth';
import { useAdmin } from '../store';
import LangSwitch from '../../components/LangSwitch.vue';
import ReportDrawer from '../components/ReportDrawer.vue';

const auth = useAuth();
const store = useAdmin();
const router = useRouter();
const { t } = useI18n();

onMounted(async () => {
  await auth.loadMe().catch(() => {});
  store.subscribe();
  await store.load();
});

function logout() {
  auth.logout();
  void router.replace('/admin/login');
}

const nav = [
  { to: '/admin', key: 'admin.nav.dashboard', icon: '📊', exact: true },
  { to: '/admin/reports', key: 'admin.nav.reports', icon: '🗂' },
  { to: '/admin/executors', key: 'admin.nav.executors', icon: '👷' },
  { to: '/admin/cleanups', key: 'admin.nav.cleanups', icon: '🧹' },
];
</script>

<template>
  <div class="flex h-full flex-col md:flex-row">
    <nav
      class="flex shrink-0 items-center gap-1 bg-caspian px-3 py-2 text-white md:w-56 md:flex-col md:items-stretch md:py-4"
    >
      <div class="mr-auto flex items-center gap-2 md:mr-0 md:mb-6 md:px-2">
        <img src="/favicon.svg" alt="" class="h-8 w-8 rounded-lg" />
        <div class="max-md:hidden">
          <p class="font-display leading-tight font-bold">{{ t('app.title') }}</p>
          <p class="text-[11px] text-white/60">{{ t('admin.title') }}</p>
        </div>
      </div>
      <RouterLink
        v-for="n in nav"
        :key="n.to"
        :to="n.to"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
        :exact-active-class="n.exact ? '!bg-aqua !text-caspian font-semibold' : ''"
        :active-class="n.exact ? '' : '!bg-aqua !text-caspian font-semibold'"
      >
        <span aria-hidden="true">{{ n.icon }}</span
        ><span class="max-sm:hidden">{{ t(n.key) }}</span>
      </RouterLink>
      <div class="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-3 md:px-2">
        <a href="/" target="_blank" class="text-sm text-white/70 hover:text-white max-md:hidden"
          >🗺 {{ t('admin.nav.map') }} ↗</a
        >
        <LangSwitch />
        <p v-if="auth.user" class="truncate text-xs text-white/50 max-md:hidden">
          {{ auth.user.email }}
        </p>
        <button
          type="button"
          class="text-left text-sm text-white/70 hover:text-white"
          @click="logout"
        >
          ⎋ <span class="max-sm:hidden">{{ t('admin.nav.logout') }}</span>
        </button>
      </div>
    </nav>

    <main class="min-h-0 min-w-0 flex-1 overflow-hidden bg-sand">
      <RouterView />
    </main>

    <ReportDrawer v-if="store.selectedId !== null" />

    <div
      class="pointer-events-none fixed bottom-4 left-4 z-[1100] flex flex-col gap-2 md:left-60"
      role="status"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <div
          v-for="n in store.notices"
          :key="n.id"
          class="pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          :class="
            n.kind === 'error' ? 'bg-st-new' : n.kind === 'info' ? 'bg-caspian' : 'bg-st-done'
          "
        >
          {{ n.text }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
