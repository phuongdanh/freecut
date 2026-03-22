import axios from 'axios';

const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
export const API_BASE_URL = `${String(raw).replace(/\/$/, '')}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = localStorage.getItem('token');
      if (hadToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

/** Bearer + optional JSON content-type for `fetch()` (axios interceptors do not apply). */
export function getAuthHeaders(includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const token = localStorage.getItem('token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** JWT for passing into workers (no `localStorage` in dedicated workers). */
export function getBearerToken(): string | undefined {
  return localStorage.getItem('token') ?? undefined;
}

export { toolsApiUrl } from '@/services/tools-api-paths';

export default api;
