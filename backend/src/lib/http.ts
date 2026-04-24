import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { env } from './env.js';

export function corsHeaders(req: HttpRequest): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allow = env.allowedOrigins.includes(origin) ? origin : env.allowedOrigins[0] || '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function preflight(req: HttpRequest): HttpResponseInit {
  return { status: 204, headers: corsHeaders(req) };
}

export function json(req: HttpRequest, status: number, body: unknown, extraHeaders: Record<string, string> = {}): HttpResponseInit {
  return {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export function errorResponse(req: HttpRequest, err: unknown): HttpResponseInit {
  if (err instanceof ApiError) {
    const extra: Record<string, string> = {};
    if (err.retryAfter) extra['Retry-After'] = String(err.retryAfter);
    return json(req, err.status, { error: { code: err.code, message: err.message, details: err.details } }, extra);
  }
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  return json(req, 500, { error: { code: 'internal_error', message } });
}
