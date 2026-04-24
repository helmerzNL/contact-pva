import { ApiError } from './http.js';
import { env, redact } from './env.js';
import { InvocationContext } from '@azure/functions';

type AppTokenCacheEntry = { token: string; exp: number };

const tokenCache = new Map<string, AppTokenCacheEntry>();

/**
 * Client credentials flow (secret). Returns a cached app-only access token for the requested resource.
 * `resource` examples:
 *   - 'https://graph.microsoft.com/.default'
 *   - 'https://outlook.office365.com/.default'
 */
export async function getAppToken(resource: string, ctx: InvocationContext): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(resource);
  if (cached && cached.exp - 60 > now) return cached.token;

  if (!env.appClientSecret) {
    throw new ApiError(
      500,
      'no_client_credential',
      'APP_CLIENT_SECRET is not set. Configure a client secret (or switch to certificate auth — see README).'
    );
  }

  const url = `https://login.microsoftonline.com/${env.targetTenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.appClientId,
    client_secret: env.appClientSecret,
    scope: resource,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    let data: unknown = await res.text();
    try {
      data = JSON.parse(data as string);
    } catch {
      /* text */
    }
    ctx.error('token_acquire_failed', redact({ status: res.status, body: data, resource }));
    throw new ApiError(502, 'token_acquire_failed', `Could not obtain app token for ${resource}`, data);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const exp = now + (json.expires_in || 3600);
  tokenCache.set(resource, { token: json.access_token, exp });
  return json.access_token;
}
