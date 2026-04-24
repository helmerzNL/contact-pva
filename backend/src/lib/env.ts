// Shared env/config + redaction helpers for the Functions app.
// No secrets are ever logged: use redact() on any object before logging.

export const env = {
  targetTenantId: required('TARGET_TENANT_ID'),
  appClientId: required('APP_CLIENT_ID'),
  appClientSecret: process.env.APP_CLIENT_SECRET || '', // optional when using cert
  apiAudience: required('API_AUDIENCE'),
  dlEmail: required('DL_EMAIL'),
  exchangeOrg: required('EXCHANGE_ORG'), // e.g. contoso.onmicrosoft.com
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Global Administrator role template id
  globalAdminRoleTemplateId: '62e90394-69f5-4237-9190-012177145e10',
};

function required(key: string): string {
  const v = process.env[key];
  if (!v || !v.trim()) {
    // Defer hard-fail to runtime so local cold start with missing vars still loads a helpful error
    return '';
  }
  return v.trim();
}

export function assertEnv(): void {
  const missing: string[] = [];
  if (!env.targetTenantId) missing.push('TARGET_TENANT_ID');
  if (!env.appClientId) missing.push('APP_CLIENT_ID');
  if (!env.apiAudience) missing.push('API_AUDIENCE');
  if (!env.dlEmail) missing.push('DL_EMAIL');
  if (!env.exchangeOrg) missing.push('EXCHANGE_ORG');
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

const TOKEN_KEYS = ['authorization', 'access_token', 'id_token', 'refresh_token', 'client_secret', 'assertion', 'password'];

export function redact<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && /^(Bearer\s+)?eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(obj)) {
      return '«redacted-jwt»' as unknown as T;
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(redact) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (TOKEN_KEYS.includes(k.toLowerCase())) {
      out[k] = '«redacted»';
    } else if (v && typeof v === 'object') {
      out[k] = redact(v);
    } else if (typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) {
      out[k] = '«redacted-jwt»';
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
