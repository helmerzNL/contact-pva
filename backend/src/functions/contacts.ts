import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { preflight, json, errorResponse, ApiError, corsHeaders } from '../lib/http.js';
import { verifyUserToken } from '../lib/verifyUserToken.js';
import { assertEnv } from '../lib/env.js';
import {
  listMailContacts,
  createMailContactAndAddToDl,
  updateMailContact,
  deleteMailContact,
} from '../lib/contacts.js';

async function handler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    if (req.method === 'OPTIONS') return preflight(req);
    assertEnv();
    await verifyUserToken(req, ctx);

    const method = req.method?.toUpperCase();
    const id = req.params.id;

    if (method === 'GET' && !id) {
      const list = await listMailContacts(ctx);
      return json(req, 200, { value: list });
    }

    if (method === 'POST' && !id) {
      const body = (await safeJson(req)) as { displayName?: string; email?: string };
      if (!body?.displayName || !body?.email) {
        throw new ApiError(400, 'bad_request', 'displayName and email are required');
      }
      const created = await createMailContactAndAddToDl(
        { displayName: body.displayName.trim(), email: body.email.trim() },
        ctx
      );
      return json(req, 201, created);
    }

    if ((method === 'PATCH' || method === 'PUT') && id) {
      const body = (await safeJson(req)) as { displayName?: string; email?: string };
      if (!body || (!body.displayName && !body.email)) {
        throw new ApiError(400, 'bad_request', 'Provide displayName and/or email');
      }
      const updated = await updateMailContact(
        id,
        {
          displayName: body.displayName?.trim(),
          email: body.email?.trim(),
        },
        ctx
      );
      return json(req, 200, updated);
    }

    if (method === 'DELETE' && id) {
      await deleteMailContact(id, ctx);
      return { status: 204, headers: corsHeaders(req) };
    }

    throw new ApiError(405, 'method_not_allowed', `Method ${method} not allowed on this route`);
  } catch (e) {
    if (!(e instanceof ApiError)) ctx.error('unhandled', { err: (e as Error).message });
    return errorResponse(req, e);
  }
}

async function safeJson(req: HttpRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

app.http('contacts', {
  route: 'contacts',
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous', // auth handled by verifyUserToken (Bearer)
  handler,
});

app.http('contacts-item', {
  route: 'contacts/{id}',
  methods: ['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler,
});
