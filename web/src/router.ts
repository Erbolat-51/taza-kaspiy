import { createRouter, createWebHistory } from 'vue-router';
import MapPage from './pages/MapPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'map', component: MapPage },
    // Админка — отдельный чанк: жителям на карте не нужен код графиков
    {
      path: '/admin/login',
      name: 'login',
      component: () => import('./admin/pages/AdminLogin.vue'),
    },
    {
      path: '/admin',
      component: () => import('./admin/pages/AdminLayout.vue'),
      meta: { auth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('./admin/pages/AdminDashboard.vue'),
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('./admin/pages/AdminReports.vue'),
        },
        {
          path: 'executors',
          name: 'executors',
          component: () => import('./admin/pages/AdminExecutors.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
