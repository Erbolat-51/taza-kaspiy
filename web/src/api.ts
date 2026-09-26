import axios from 'axios';
import type { Report, ReportDetails, Summary, Zone } from './types';

export const http = axios.create({ baseURL: '/api', timeout: 20_000 });

export const api = {
  reports: () =>
    http
      .get<{ total: number; items: Report[] }>('/reports', { params: { limit: 2000 } })
      .then((r) => r.data.items),
  report: (id: number) => http.get<ReportDetails>(`/reports/${id}`).then((r) => r.data),
  zones: () => http.get<Zone[]>('/zones').then((r) => r.data),
  summary: () => http.get<Summary>('/stats/summary').then((r) => r.data),
};
