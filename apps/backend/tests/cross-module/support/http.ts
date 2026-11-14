import { expect } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../../src/bootstrap/http/create-app.js';
import { readRuntimeConfig } from '../../../src/bootstrap/runtime-config.js';

const app = createApp(readRuntimeConfig());
export const entitySchema = z.object({ id: z.string().min(1) });
export interface Identity { readonly token: string }
export interface ApiResult { readonly status: number; readonly body: unknown; readonly headers: Headers }
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function request(method: Method, path: string, identity: Identity | null, body?: unknown, apiKey?: string, extraHeaders: Readonly<Record<string, string>> = {}): Promise<ApiResult> {
  const headers = new Headers({ Origin: 'http://localhost:3100' });
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  if (identity) headers.set('Authorization', `Bearer ${identity.token}`);
  if (apiKey) headers.set('x-api-key', apiKey);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  return { status: response.status, body: parsed, headers: response.headers };
}

export function data<T>(result: ApiResult, status: number, schema: z.ZodType<T>): T {
  expect(result.status, JSON.stringify(result.body)).toBe(status);
  return z.object({ data: schema }).parse(result.body).data;
}

export async function create(path: string, identity: Identity, body: unknown): Promise<string> {
  return data(await request('POST', path, identity, body), 201, entitySchema).id;
}
