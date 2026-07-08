import type {
  AccountingMethod,
  AccountMap,
  AppUser,
  ClientDataset,
  ClientSummary,
  SyncLogEntry,
  SyncResult,
  UserRole,
} from '../types.ts';

export type ApiErrorCode = 'needs_reauth' | 'not_found' | 'qbo_error' | 'sync_in_progress' | 'bad_request';

export class ApiError extends Error {
  status: number;
  code?: ApiErrorCode;

  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, (body as { code?: ApiErrorCode } | null)?.code);
  }
  return body as T;
}

export const api = {
  listClients: () => request<ClientSummary[]>('/clients'),

  getDataset: (realmId: string) => request<ClientDataset>(`/clients/${encodeURIComponent(realmId)}/dataset`),

  sync: (realmId: string, opts?: { startDate?: string; endDate?: string }) =>
    request<SyncResult>(`/clients/${encodeURIComponent(realmId)}/sync`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  saveAccountMap: (realmId: string, accountMap: AccountMap) =>
    request<{ ok: true }>(`/clients/${encodeURIComponent(realmId)}/account-map`, {
      method: 'PUT',
      body: JSON.stringify({ accountMap }),
    }),

  getSyncLog: (realmId: string, limit = 20) =>
    request<SyncLogEntry[]>(`/clients/${encodeURIComponent(realmId)}/sync-log?limit=${limit}`),

  saveSettings: (
    realmId: string,
    settings: { syncStartDate?: string | null; accountingMethod?: AccountingMethod; closedThrough?: string | null },
  ) =>
    request<{ ok: true }>(`/clients/${encodeURIComponent(realmId)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  disconnect: (realmId: string) =>
    request<{ ok: true }>(`/clients/${encodeURIComponent(realmId)}`, { method: 'DELETE' }),

  listUsers: () => request<AppUser[]>('/users'),

  createUser: (user: { email: string; name: string; role: UserRole; realmIds?: string[] }) =>
    request<AppUser>('/users', { method: 'POST', body: JSON.stringify(user) }),

  updateUser: (id: number, fields: { name?: string; role?: UserRole; realmIds?: string[] }) =>
    request<AppUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),

  deleteUser: (id: number) => request<{ ok: true }>(`/users/${id}`, { method: 'DELETE' }),
};
