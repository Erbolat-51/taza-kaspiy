import { http } from '../api';
import type { ReportStatus } from '../types';
import type { AdminDetails, AdminReport, Dashboard, Executor } from './types';

export const adminApi = {
  reports: () => http.get<{ items: AdminReport[] }>('/admin/reports').then((r) => r.data.items),
  report: (id: number) => http.get<AdminDetails>(`/admin/reports/${id}`).then((r) => r.data),
  dashboard: () => http.get<Dashboard>('/admin/dashboard').then((r) => r.data),
  executors: () => http.get<Executor[]>('/executors').then((r) => r.data),
  setStatus: (id: number, status: ReportStatus, reason?: string) =>
    http.patch<AdminReport>(`/reports/${id}/status`, { status, reason }).then((r) => r.data),
  assign: (id: number, executorId: number) =>
    http.post<AdminReport>(`/reports/${id}/assign`, { executorId }).then((r) => r.data),
  afterPhoto: (id: number, file: File) => {
    const fd = new FormData();
    fd.set('photo', file);
    return http.post<AdminReport>(`/reports/${id}/after-photo`, fd).then((r) => r.data);
  },
};

/** Текст ошибки API для тоста: сервер отдаёт { error, message }. */
export function apiError(e: unknown): string {
  const data = (e as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message ?? data?.error ?? (e instanceof Error ? e.message : String(e));
}
