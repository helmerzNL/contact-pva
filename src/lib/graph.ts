'use client';

import { getAccessToken } from './auth';
import { config } from './config';

export type OrgContact = {
  id: string;
  displayName?: string;
  mail?: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// Back-compat alias — App.tsx imports GraphError.
export const GraphError = ApiError;

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const url = `${config.apiBaseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const data = await res.clone().json();
      msg = data?.error?.message || msg;
      code = data?.error?.code;
    } catch {}
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(res.status, msg, code, retryAfter);
  }
  return res;
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- API surface used by App.tsx ----

export async function getMe(): Promise<{ id: string; displayName: string; userPrincipalName: string }> {
  // We no longer need Graph /me: the SPA already has claims via MSAL. This stub remains for callers.
  return { id: '', displayName: '', userPrincipalName: '' };
}

/**
 * Global-admin check moved to backend (it validates wids in the token on every call).
 * Front-end still checks wids claim locally as UX guard; keep this for back-compat.
 */
export async function hasDirectoryRole(_roleTemplateId: string): Promise<boolean> {
  return true;
}

export async function listOrgContacts(): Promise<OrgContact[]> {
  const data = await apiJson<{ value: Array<{ id: string; displayName: string; email: string }> }>('/api/contacts');
  return data.value.map((c) => ({ id: c.id, displayName: c.displayName, mail: c.email }));
}

export async function createOrgContact(input: { displayName: string; email: string }): Promise<OrgContact> {
  const c = await apiJson<{ id: string; displayName: string; email: string }>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify({ displayName: input.displayName, email: input.email }),
  });
  return { id: c.id, displayName: c.displayName, mail: c.email };
}

export async function updateOrgContact(
  id: string,
  patch: Partial<{ displayName: string; mail: string }>
): Promise<void> {
  await apiFetch(`/api/contacts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: patch.displayName,
      email: patch.mail,
    }),
  });
}

export async function deleteOrgContact(id: string): Promise<void> {
  await apiFetch(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---- Back-compat stubs ----
// The old UI also called findGroupByMail + addMemberToGroup after createOrgContact.
// The backend now handles DL-membership atomically in POST /api/contacts, so these are no-ops.

export type Group = { id: string; displayName?: string; mail?: string };

export async function findGroupByMail(_mail: string): Promise<Group | null> {
  // Not needed anymore; backend handles DL. Return a stub so the UI toast stays happy.
  return { id: 'handled-by-backend', displayName: config.dlEmail, mail: config.dlEmail };
}

export async function addMemberToGroup(_groupId: string, _directoryObjectId: string): Promise<void> {
  // no-op — backend already added the new contact to the DL
}
