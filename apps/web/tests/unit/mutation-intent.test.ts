import { expect, it } from 'vitest';
import { MutationIntentRegistry } from '@/lib/http/mutation-intent';
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage, registry: new MutationIntentRegistry(storage) };
}
it('preserves the intent after an ambiguous timeout, including component/browser reload, without persisting payment data', async () => {
  const { registry, storage, values } = fixture();
  let firstKey = '';
  const input = { amount: 123.45, notes: 'private customer note' };
  await expect(registry.execute('tenant-A:user', '/payments', input, async (key) => { firstKey = key; throw { error: { code: 'NETWORK_ERROR', message: 'Timeout' } }; })).rejects.toBeDefined();
  expect(JSON.stringify([...values.values()])).not.toContain('private customer note');
  expect(JSON.stringify([...values.values()])).not.toContain('123.45');
  const afterReload = new MutationIntentRegistry(storage);
  expect(await afterReload.execute('tenant-A:user', '/payments', input, async (key) => { expect(key).toBe(firstKey); return 'replayed-success'; })).toBe('replayed-success');
  expect([...values.values()]).toEqual(['[]']);
});
it('rejects a changed payload while the previous result is ambiguous and keeps tenants separate', async () => {
  const { registry } = fixture();
  await expect(registry.execute('A', '/stock', { quantity: 1 }, async () => { throw new Error('Ambiguous'); })).rejects.toThrow();
  await expect(registry.execute('A', '/stock', { quantity: 2 }, async () => 'must not send')).rejects.toMatchObject({ error: { code: 'MUTATION_RECOVERY_REQUIRED' } });
  expect(await registry.execute('B', '/stock', { quantity: 2 }, async () => 'B success')).toBe('B success');
});
it('reuses an ambiguous key when a remounted form supplies a newly generated key for the same payload', async () => {
  const { registry, storage } = fixture();
  await expect(registry.execute('A', '/payments', { amount: 1, idempotencyKey: 'original-form-key' }, async (key) => { expect(key).toBe('original-form-key'); throw new Error('Response lost after commit'); })).rejects.toThrow();
  const reloaded = new MutationIntentRegistry(storage);
  await expect(reloaded.execute('A', '/payments', { amount: 1, idempotencyKey: 'new-form-key-after-reload' }, async (key) => { expect(key).toBe('original-form-key'); return 'one-effect'; })).resolves.toBe('one-effect');
});
it('prevents concurrent duplicate submissions before invoking the transport', async () => {
  const { registry } = fixture();
  let complete: (value: string) => void = () => undefined;
  let started: () => void = () => undefined;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const first = registry.execute('A', '/payments', { amount: 1 }, () => { started(); return new Promise<string>(resolve => { complete = resolve; }); });
  await ready;
  await expect(registry.execute('A', '/payments', { amount: 1 }, async () => 'duplicate')).rejects.toMatchObject({ error: { code: 'MUTATION_IN_PROGRESS' } });
  complete('success');
  expect(await first).toBe('success');
});
it('allows correction after a definitive validation failure', async () => {
  const { registry } = fixture();
  await expect(registry.execute('A', '/payments', { amount: -1 }, async () => { throw { error: { code: 'VALIDATION_ERROR', message: 'Positive amount required' } }; })).rejects.toBeDefined();
  expect(await registry.execute('A', '/payments', { amount: 1 }, async () => 'corrected')).toBe('corrected');
});
it('fails closed when storage is unavailable or corrupted', async () => {
  const denied = new MutationIntentRegistry({ getItem: () => null, setItem: () => { throw new Error('Blocked'); } });
  await expect(denied.execute('A', '/payments', {}, async () => 'must not send')).rejects.toMatchObject({ error: { code: 'MUTATION_RECOVERY_REQUIRED' } });
  const broken = new MutationIntentRegistry({ getItem: () => 'broken', setItem: () => undefined });
  await expect(broken.execute('A', '/payments', {}, async () => 'must not send')).rejects.toMatchObject({ error: { code: 'MUTATION_RECOVERY_REQUIRED' } });
});
