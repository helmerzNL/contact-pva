// Runtime config loader. Leest eerst window.__APP_CONFIG__ (public/config.js), dan NEXT_PUBLIC_* env.
declare global {
  interface Window {
    __APP_CONFIG__?: Partial<{
      CLIENT_ID: string;
      TENANT_ID: string;
      DL_EMAIL: string;
      API_BASE_URL: string;
      API_SCOPE: string;
    }>;
  }
}

const DEFAULT_TENANT_ID = 'bf2f39aa-496c-406a-940c-41e73a851d39';

type CfgKey = 'CLIENT_ID' | 'TENANT_ID' | 'DL_EMAIL' | 'API_BASE_URL' | 'API_SCOPE';
function fromWindow(key: CfgKey): string | undefined {
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
  get apiBaseUrl(): string {
    return (
      fromWindow('API_BASE_URL') ||
      process.env.NEXT_PUBLIC_API_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    );
  },
  // Scope voor user-token richting de Function App Registration.
  // Formaat: api://{function-app-id}/access_as_user
  get apiScope(): string {
    return (
      fromWindow('API_SCOPE') ||
      process.env.NEXT_PUBLIC_API_SCOPE ||
      'api://YOUR_FUNCTION_APP_ID/access_as_user'
    );
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

// Alleen de Function-scope is nog nodig; alle Graph/Exchange-calls gaan via de backend.
// User.Read blijft als lichte extra (login-info).
export const API_SCOPES = [
  'User.Read',
  // Function scope wordt dynamisch uit config gelezen — losse helper:
];
export function getApiScopes(apiScope: string): string[] {
  return ['User.Read', apiScope];
}
// Back-compat export (oude imports heten nog GRAPH_SCOPES)
export const GRAPH_SCOPES = API_SCOPES;

export const GLOBAL_ADMIN_ROLE_TEMPLATE_ID = '62e90394-69f5-4237-9190-012177145e10';
