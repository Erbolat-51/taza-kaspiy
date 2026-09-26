import { createRouter, createWebHistory } from 'vue-router';
import MapPage from './pages/MapPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'map', component: MapPage },
    { path: '/zones', name: 'zones', component: () => import('./pages/ZonesPage.vue') },
    { path: '/report', name: 'report', component: () => import('./pages/ReportPage.vue') },
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
        {
          path: 'cleanups',
          name: 'cleanups',
          component: () => import('./admin/pages/AdminCleanups.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
