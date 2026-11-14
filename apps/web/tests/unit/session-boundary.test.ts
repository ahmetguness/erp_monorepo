import axios, { AxiosError, type AxiosResponse } from 'axios';
import { expect, it } from 'vitest';
import { installSessionBoundary } from '../../src/lib/http/session-boundary';

it.each(['success', 'unauthorized'] as const)('rejects an old %s response after A → B → A, even without tenantId in data', async (kind) => {
  let identity = 'A';
  let notify: () => void = () => undefined;
  let finish: () => void = () => undefined;
  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const client = axios.create({ adapter: (config) => new Promise<AxiosResponse>((resolve, reject) => {
    finish = () => {
      const response: AxiosResponse = { config, data: { total: 999 }, headers: {}, status: kind === 'success' ? 200 : 401, statusText: 'Result' };
      if (kind === 'success') resolve(response); else reject(new AxiosError('Old unauthorized', 'ERR_BAD_REQUEST', config, undefined, response));
    };
    started();
  }) });
  installSessionBoundary(client, () => identity, (changed) => { notify = changed; });
  const pending = client.get('/reports');
  await ready;
  identity = 'B'; notify(); identity = 'A'; notify(); finish();
  await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
});

it('accepts a response for the unchanged identity', async () => {
  const client = axios.create({ adapter: async (config) => ({ config, data: { total: 1 }, headers: {}, status: 200, statusText: 'OK' }) });
  installSessionBoundary(client, () => 'A:user-1', () => undefined);
  expect((await client.get('/reports')).data).toEqual({ total: 1 });
});
