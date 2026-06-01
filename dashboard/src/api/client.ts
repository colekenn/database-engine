import type { ApiRecord, Health, RangeResponse, Stats, TreeSnapshot } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Request failed with ${response.status}`);
  }
  return data as T;
}

const encodePath = (value: string) => encodeURIComponent(value);

export const api = {
  baseUrl: API_BASE,

  health() {
    return request<Health>('/health');
  },

  stats() {
    return request<Stats>('/stats');
  },

  tree(key?: string) {
    const query = key ? `?key=${encodeURIComponent(key)}` : '';
    return request<TreeSnapshot>(`/tree${query}`);
  },

  insertRecord(key: string, value: string) {
    return request<ApiRecord & { inserted: boolean }>('/records', {
      method: 'POST',
      body: { key, value },
    });
  },

  getRecord(key: string) {
    return request<ApiRecord>(`/records/${encodePath(key)}`);
  },

  updateRecord(key: string, value: string) {
    return request<ApiRecord & { inserted: boolean }>(`/records/${encodePath(key)}`, {
      method: 'PUT',
      body: { value },
    });
  },

  deleteRecord(key: string) {
    return request<{ key: string; deleted: boolean }>(`/records/${encodePath(key)}`, {
      method: 'DELETE',
    });
  },

  range(start: string, end: string, limit = 100) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    params.set('limit', String(limit));
    return request<RangeResponse>(`/range?${params.toString()}`);
  },
};
