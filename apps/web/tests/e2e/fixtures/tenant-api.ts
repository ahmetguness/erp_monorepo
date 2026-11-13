import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

export class TenantApi {
  constructor(private readonly client: APIRequestContext, private readonly origin: string) {}

  async send<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const response = await this.client.fetch(`http://localhost:3001${path}`, {
      method, headers: { origin: this.origin }, data: body,
    });
    const payload: unknown = await response.json();
    if (!response.ok()) throw new Error(`${method} ${path}: ${response.status()} ${JSON.stringify(payload)}`);
    return z.object({ data: schema }).parse(payload).data;
  }

  async create(path: string, body: unknown): Promise<string> {
    return (await this.send('POST', path, z.object({ id: z.string() }), body)).id;
  }
}
