// Runtime config loader. Leest eerst window.__APP_CONFIG__ (public/config.js), dan NEXT_PUBLIC_* env.
declare global {
  interface Window {
    __APP_CONFIG__?: Partial<{ CLIENT_ID: string; TENANT_ID: string; DL_EMAIL: string }>;
  }
}

const DEFAULT_TENANT_ID = 'bf2f39aa-496c-406a-940c-41e73a851d39';

function fromWindow(key: 'CLIENT_ID' | 'TENANT_ID' | 'DL_EMAIL'): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = window.__APP_CONFIG__?.[key];
  return v && v.trim() ? v.trim() : undefined;
}

export const config = {
  get clientId(): string {
    return fromWindow('CLIENT_ID') || process.env.NEXT_PUBLIC_CLIENT_ID || 'YOUR_CLIENT_ID';
  },
  get tenantId(): string {
    return fromWindow('TENANT_ID') || process.env.NEXT_PUBLIC_TENANT_ID || DEFAULT_TENANT_ID;
  },
  get dlEmail(): string {
    return fromWindow('DL_EMAIL') || process.env.NEXT_PUBLIC_DL_EMAIL || 'leden@example.com';
  },
  get authority(): string {
    return `https://login.microsoftonline.com/${this.tenantId}`;
  },
  get redirectUri(): string {
    if (typeof window === 'undefined') return 'https://contact.nietvooriedereen.nl/';
    return `${window.location.origin}/`;
  },
  get isConfigured(): boolean {
    return this.clientId !== 'YOUR_CLIENT_ID' && this.clientId.length > 10;
  },
};

export const GRAPH_SCOPES = [
  'User.Read',
  'Contacts.ReadWrite',
  'Group.ReadWrite.All',
];

export const GLOBAL_ADMIN_ROLE_TEMPLATE_ID = '62e90394-69f5-4237-9190-012177145e10';
