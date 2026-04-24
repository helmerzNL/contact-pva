'use client';

import { getAccessToken } from './auth';

const GRAPH = 'https://graph.microsoft.com';

export type OrgContact = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  companyName?: string;
};

export type Group = {
  id: string;
  displayName?: string;
  mail?: string;
  groupTypes?: string[];
  mailEnabled?: boolean;
  securityEnabled?: boolean;
};

export class GraphError extends Error {
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

async function graphFetch(
  path: string,
  init: RequestInit = {},
  opts: { version?: 'v1.0' | 'beta' } = {}
): Promise<Response> {
  const token = await getAccessToken();
  const version = opts.version || 'v1.0';
  const url = path.startsWith('http') ? path : `${GRAPH}/${version}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
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
    throw new GraphError(res.status, msg, code, retryAfter);
  }
  return res;
}

async function graphJson<T>(path: string, init: RequestInit = {}, opts: { version?: 'v1.0' | 'beta' } = {}): Promise<T> {
  const res = await graphFetch(path, init, opts);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getMe(): Promise<{ id: string; displayName: string; userPrincipalName: string }> {
  return graphJson('/me?$select=id,displayName,userPrincipalName');
}

// Check Global Admin via directory role memberships (role template id)
export async function hasDirectoryRole(roleTemplateId: string): Promise<boolean> {
  try {
    const data = await graphJson<{ value: Array<{ id: string; roleTemplateId: string }> }>(
      '/me/memberOf/microsoft.graph.directoryRole?$select=id,roleTemplateId'
    );
    return data.value.some((r) => r.roleTemplateId === roleTemplateId);
  } catch {
    return false;
  }
}

// Organization contacts (read via v1.0 /contacts)
export async function listOrgContacts(): Promise<OrgContact[]> {
  const data = await graphJson<{ value: OrgContact[] }>(
    '/contacts?$select=id,displayName,givenName,surname,mail,companyName&$top=999'
  );
  return data.value;
}

// Create org contact — beta endpoint ondersteunt write
export async function createOrgContact(input: { displayName: string; givenName?: string; surname?: string; email: string }): Promise<OrgContact> {
  const body = {
    displayName: input.displayName,
    givenName: input.givenName,
    surname: input.surname,
    mail: input.email,
  };
  return graphJson<OrgContact>('/contacts', { method: 'POST', body: JSON.stringify(body) }, { version: 'beta' });
}

export async function updateOrgContact(id: string, patch: Partial<{ displayName: string; givenName: string; surname: string; mail: string }>): Promise<void> {
  await graphFetch(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, { version: 'beta' });
}

export async function deleteOrgContact(id: string): Promise<void> {
  await graphFetch(`/contacts/${id}`, { method: 'DELETE' }, { version: 'beta' });
}

// Groups
export async function findGroupByMail(mail: string): Promise<Group | null> {
  const filter = encodeURIComponent(`mail eq '${mail.replace(/'/g, "''")}'`);
  const data = await graphJson<{ value: Group[] }>(`/groups?$filter=${filter}&$select=id,displayName,mail,groupTypes,mailEnabled,securityEnabled`);
  return data.value[0] || null;
}

export async function addMemberToGroup(groupId: string, directoryObjectId: string): Promise<void> {
  await graphFetch(`/groups/${groupId}/members/$ref`, {
    method: 'POST',
    body: JSON.stringify({ '@odata.id': `${GRAPH}/v1.0/directoryObjects/${directoryObjectId}` }),
  });
}
