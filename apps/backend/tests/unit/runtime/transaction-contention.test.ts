import { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, expect, test, vi } from 'vitest';
import { serializableTransaction } from '../../../src/lib/serializable-transaction.js';
import { ConflictError } from '../../../src/errors/index.js';

const db = new PrismaClient();
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const serializationFailure = () => new Prisma.PrismaClientKnownRequestError('Synthetic serialization conflict', { code: 'P2010', clientVersion: 'test', meta: { code: '40001' } });

test('raw SQL serialization conflicts use bounded backoff and can recover', async () => {
  vi.useFakeTimers();
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValueOnce(serializationFailure()).mockResolvedValue(42);
  const result = serializableTransaction(db, async () => 42, 5);
  await vi.runAllTimersAsync();
  expect(await result).toBe(42);
  expect(transaction).toHaveBeenCalledTimes(2);
});
test('retry exhaustion becomes an operational conflict instead of a server error', async () => {
  vi.useFakeTimers();
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValue(serializationFailure());
  const assertion = expect(serializableTransaction(db, async () => 42, 5)).rejects.toBeInstanceOf(ConflictError);
  await vi.runAllTimersAsync(); await assertion;
  expect(transaction).toHaveBeenCalledTimes(5);
});
test('unrelated raw SQL errors are propagated without retries', async () => {
  const failure = new Prisma.PrismaClientKnownRequestError('Synthetic schema error', { code: 'P2010', clientVersion: 'test', meta: { code: '42P01' } });
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValue(failure);
  await expect(serializableTransaction(db, async () => 42, 5)).rejects.toBe(failure);
  expect(transaction).toHaveBeenCalledTimes(1);
});
