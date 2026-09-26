import { createRouter, createWebHistory } from 'vue-router';
import MapPage from './pages/MapPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'map', component: MapPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
