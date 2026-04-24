import { HttpRequest, InvocationContext } from '@azure/functions';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { env } from './env.js';
import { ApiError } from './http.js';
import { redact } from './env.js';

type VerifiedClaims = JWTPayload & {
  tid?: string;
  oid?: string;
  upn?: string;
  preferred_username?: string;
  wids?: string[];
  roles?: string[];
  scp?: string;
};

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwksCache) {
    const url = new URL(`https://login.microsoftonline.com/${env.targetTenantId}/discovery/v2.0/keys`);
    jwksCache = createRemoteJWKSet(url);
  }
  return jwksCache;
}

/**
 * Validate the incoming SPA user token.
 *  - Signed by the target tenant
 *  - Audience = our Function App Registration
 *  - tid = target tenant
 *  - wids contains Global Admin role template id
 */
export async function verifyUserToken(req: HttpRequest, ctx: InvocationContext): Promise<VerifiedClaims> {
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new ApiError(401, 'missing_token', 'Missing Bearer token');
  const token = m[1]!;

  const issuers = [
    `https://login.microsoftonline.com/${env.targetTenantId}/v2.0`,
    `https://sts.windows.net/${env.targetTenantId}/`,
  ];

  const audiences = [env.apiAudience];
  // Accept bare GUID audience too (v1.0 tokens sometimes emit only the client id)
  if (env.apiAudience.startsWith('api://')) {
    const guid = env.apiAudience.slice('api://'.length);
    if (guid) audiences.push(guid);
  }

  let payload: VerifiedClaims;
  try {
    const { payload: p } = await jwtVerify(token, getJwks(), {
      issuer: issuers,
      audience: audiences,
    });
    payload = p as VerifiedClaims;
  } catch (e) {
    ctx.warn('token_verify_failed', redact({ err: (e as Error).message }));
    throw new ApiError(401, 'invalid_token', 'Token verification failed');
  }

  if (payload.tid !== env.targetTenantId) {
    throw new ApiError(403, 'wrong_tenant', 'Token is not from the expected tenant');
  }

  const wids = Array.isArray(payload.wids) ? payload.wids : [];
  if (!wids.includes(env.globalAdminRoleTemplateId)) {
    throw new ApiError(403, 'not_global_admin', 'Global Administrator role required');
  }

  return payload;
}
