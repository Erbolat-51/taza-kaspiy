import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { http } from './api';
import { useAuth } from './admin/auth';
import './styles.css';

const app = createApp(App).use(createPinia()).use(router).use(i18n);
const auth = useAuth();

// JWT для админских запросов; истёк/невалиден → на страницу входа
http.interceptors.request.use((config) => {
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});
http.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && auth.token) {
    auth.logout();
    const here = router.currentRoute.value.fullPath;
    if (here.startsWith('/admin')) void router.replace({ name: 'login', query: { next: here } });
  }
  return Promise.reject(err);
});

router.beforeEach((to) => {
  if (to.matched.some((r) => r.meta.auth) && !auth.isAuthed) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  if (to.name === 'login' && auth.isAuthed) return { path: '/admin' };
});

app.mount('#app');
