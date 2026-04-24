import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { preflight, json } from '../lib/http.js';

app.http('health', {
  route: 'health',
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    if (req.method === 'OPTIONS') return preflight(req);
    return json(req, 200, { ok: true, ts: new Date().toISOString() });
  },
});
