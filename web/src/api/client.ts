import type {
  AuthUser,
  LoginResponse,
  SearchRequest,
  SearchResponse,
  Tenant,
  LocationType,
} from '@dealer/shared';

// Empty string => same-origin (used when the API serves the built web app).
// Unset => local dev default.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:4000';
const TOKEN_KEY = 'dl_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>('/api/auth/me'),
  tenants: () => request<Tenant[]>('/api/tenants'),
  locationTypes: (tenantId: string) =>
    request<LocationType[]>(`/api/tenants/${tenantId}/location-types`),
  search: (body: SearchRequest) =>
    request<SearchResponse>('/api/search', { method: 'POST', body: JSON.stringify(body) }),
  location: (id: string) => request<any>(`/api/locations/${id}`),
  locationHistory: (id: string) => request<any[]>(`/api/locations/${id}/history`),
  tenantLocations: (tenantId: string) => request<any[]>(`/api/tenants/${tenantId}/locations`),
  updateLocation: (id: string, body: unknown) =>
    request<any>(`/api/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setStopTow: (id: string, body: unknown) =>
    request<any>(`/api/locations/${id}/stop-tow`, { method: 'POST', body: JSON.stringify(body) }),
  setLock: (id: string, locked: boolean) =>
    request<any>(`/api/locations/${id}/stop-tow/lock`, {
      method: 'POST',
      body: JSON.stringify({ locked }),
    }),
  bulkStopTow: (body: unknown) =>
    request<{ updated: number }>('/api/stop-tow/bulk', { method: 'POST', body: JSON.stringify(body) }),
  importExcel: (tenantId: string, fileBase64: string) =>
    request<{ processed: number; created: number; updated: number }>('/api/import', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, file_base64: fileBase64 }),
    }),
  runChangeRegister: (tenantId: string, club: string) =>
    request<any>('/api/admin/change-register/run', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, club }),
    }),
  exportExcel: async (tenantId: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${BASE}/api/tenants/${tenantId}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, 'Export failed');
    return res.blob();
  },
};
