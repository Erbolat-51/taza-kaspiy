import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { http } from '../api';

interface AdminUser {
  sub: number;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
}

const KEY = 'taza-admin-token';

/** JWT хранится в localStorage — это токен сессии, а не данные (данные только в БД). */
const readToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const useAuth = defineStore('auth', () => {
  const token = ref<string | null>(readToken());
  const user = ref<AdminUser | null>(null);
  const isAuthed = computed(() => !!token.value);

  function setToken(t: string | null) {
    token.value = t;
    try {
      if (t) localStorage.setItem(KEY, t);
      else localStorage.removeItem(KEY);
    } catch {
      /* приватный режим: токен живёт до перезагрузки */
    }
  }

  async function login(email: string, password: string) {
    const { data } = await http.post<{ token: string; user: AdminUser }>('/auth/login', {
      email,
      password,
    });
    setToken(data.token);
    user.value = data.user;
  }

  async function loadMe() {
    if (!token.value || user.value) return;
    const { data } = await http.get<AdminUser>('/auth/me');
    user.value = data;
  }

  function logout() {
    setToken(null);
    user.value = null;
  }

  return { token, user, isAuthed, login, loadMe, logout };
});
