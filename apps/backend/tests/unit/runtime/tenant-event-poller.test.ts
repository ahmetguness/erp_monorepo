import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TenantEventPoller, type RealtimeBatch, type RealtimeEvent, type RealtimeReader } from '../../../src/modules/collaboration/chat/infrastructure/realtime/tenant-event-poller.js';

const epoch = new Date('2026-11-18T00:00:00Z').getTime();
const hubs: TenantEventPoller[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => { for (const hub of hubs.splice(0)) hub.stop(); vi.useRealTimers(); });
const event = (id: string, tenantId = 'a', at = Date.now()): RealtimeEvent => ({ id, tenantId, conversationId: 'room', type: 'message.created', payload: {}, createdAt: new Date(at), recipientIds: ['user-0'] });
const listener = (userId = 'user-0') => ({ userId, clientIp: '127.0.0.1', send: vi.fn(() => true), close: vi.fn() });
function hub(read: RealtimeReader) { const value = new TenantEventPoller(read); hubs.push(value); return value; }

test('twenty-five connections share one tenant read while fresh recipient membership controls fanout', async () => {
  const read = vi.fn<RealtimeReader>(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: [event('one')] }));
  const stream = hub(read); const listeners = Array.from({ length: 25 }, (_, i) => listener(`user-${i % 5}`));
  const leaves = listeners.map((value) => stream.subscribe('a', value));
  await vi.advanceTimersByTimeAsync(1100);
  expect(read).toHaveBeenCalledTimes(1);
  expect(listeners.reduce((sum, value) => sum + value.send.mock.calls.length, 0)).toBe(5);
  for (const leave of leaves) { leave(); leave(); }
  expect(stream.stats).toMatchObject({ tenants: 0, connections: 0, rememberedEvents: 0 });
});

test('overlapping windows recover a late commit without replaying already observed event identities', async () => {
  let calls = 0;
  const stream = hub(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: ++calls === 1 ? [event('newer', 'a', epoch + 900)] : [event('late', 'a', epoch + 500), event('newer', 'a', epoch + 900)] }));
  const socket = listener(); stream.subscribe('a', socket);
  await vi.advanceTimersByTimeAsync(3100);
  expect(socket.send).toHaveBeenCalledTimes(2);
});

test('reader concurrency is bounded and a slow query cannot overlap itself or starve another tenant', async () => {
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const read = vi.fn<RealtimeReader>(async (_tenant, audience) => { await barrier; return { authorizedIds: audience.map((member) => member.connectionId), events: [] }; });
  const stream = hub(read);
  for (const tenant of ['a', 'b', 'c']) stream.subscribe(tenant, listener());
  await vi.advanceTimersByTimeAsync(3500);
  expect(read).toHaveBeenCalledTimes(2); expect(stream.stats.inFlight).toBe(2);
  release(); await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(3); expect(stream.stats.inFlight).toBe(0);
});

test('a stalled scheduler resumes from its last scan without skipping committed messages', async () => {
  const read = vi.fn<RealtimeReader>(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: [] }));
  const stream = hub(read); const socket = listener(); stream.subscribe('a', socket);
  await vi.advanceTimersByTimeAsync(1100);
  vi.setSystemTime(epoch + 40_000);
  read.mockResolvedValueOnce({ authorizedIds: [1], events: [event('during-stall', 'a', epoch + 2000)] });
  await vi.advanceTimersByTimeAsync(1000);
  expect(read.mock.calls[1][2].getTime()).toBeLessThan(epoch);
  expect(socket.send).toHaveBeenCalledTimes(1);
});

test('a full page keeps its original time boundary and continues with a stable timestamp/id cursor', async () => {
  const page = Array.from({ length: 500 }, (_, i) => event(String(i).padStart(4, '0'), 'a', epoch + 200));
  const read = vi.fn<RealtimeReader>(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: [] }));
  read.mockResolvedValueOnce({ authorizedIds: [1], events: page });
  read.mockResolvedValueOnce({ authorizedIds: [1], events: [event('0500', 'a', epoch + 200)] });
  const stream = hub(read); const socket = listener(); stream.subscribe('a', socket);
  await vi.advanceTimersByTimeAsync(3100);
  expect(read.mock.calls[1][2].getTime()).toBe(epoch - 10_000);
  expect(read.mock.calls[1][3]).toEqual({ id: '0499', createdAt: new Date(epoch + 200) });
  expect(read.mock.calls[2][2].getTime()).toBe(epoch - 9000);
  expect(read.mock.calls[2][3]).toBeUndefined();
  expect(socket.send).toHaveBeenCalledTimes(501);
});

test('a foreign-tenant reader result fails closed and never reaches a socket', async () => {
  const stream = hub(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: [event('foreign', 'b')] }));
  const socket = listener(); stream.subscribe('a', socket);
  await vi.advanceTimersByTimeAsync(1100);
  expect(socket.send).not.toHaveBeenCalled(); expect(socket.close).toHaveBeenCalledWith(1011, expect.any(String));
  expect(stream.stats.connections).toBe(0);
});

test('revoked sessions and slow consumers close their connections and release their tenant state', async () => {
  const denied = listener(); const rejected = hub(async () => ({ authorizedIds: [], events: [] })); rejected.subscribe('a', denied);
  await vi.advanceTimersByTimeAsync(1100);
  expect(denied.close).toHaveBeenCalledWith(1008, expect.any(String));
  const slow = listener(); slow.send.mockReturnValue(false);
  const stream = hub(async (_tenant, audience): Promise<RealtimeBatch> => ({ authorizedIds: audience.map((member) => member.connectionId), events: [event('one')] }));
  stream.subscribe('a', slow); await vi.advanceTimersByTimeAsync(1100);
  expect(slow.close).toHaveBeenCalledWith(1013, expect.any(String)); expect(stream.stats.rememberedEvents).toBe(0);
});

test('a closed connection cannot receive the result of a pending database operation', async () => {
  let finish: (batch: RealtimeBatch) => void = () => {};
  const result = new Promise<RealtimeBatch>((resolve) => { finish = resolve; });
  const stream = hub(() => result); const socket = listener();
  const leave = stream.subscribe('a', socket); await vi.advanceTimersByTimeAsync(1100); leave();
  finish({ authorizedIds: [1], events: [event('late')] }); await vi.advanceTimersByTimeAsync(1);
  expect(socket.send).not.toHaveBeenCalled(); expect(stream.stats.tenants).toBe(0);
});

test('a connection joining during a pending read receives post-connect events on the next fresh batch', async () => {
  let finish: (batch: RealtimeBatch) => void = () => {};
  const pending = new Promise<RealtimeBatch>((resolve) => { finish = resolve; });
  const message = event('during-join', 'a', epoch + 1300);
  const read = vi.fn<RealtimeReader>(async (_tenant, audience) => ({ authorizedIds: audience.map((member) => member.connectionId), events: [message] }));
  read.mockReturnValueOnce(pending);
  const stream = hub(read); const first = listener(); stream.subscribe('a', first);
  await vi.advanceTimersByTimeAsync(1100);
  vi.setSystemTime(epoch + 1200); const second = listener(); stream.subscribe('a', second);
  vi.setSystemTime(epoch + 1400); finish({ authorizedIds: [1], events: [message] });
  await vi.advanceTimersByTimeAsync(1100);
  expect(first.send).toHaveBeenCalledTimes(1);
  expect(second.send).toHaveBeenCalledTimes(1);
  expect(stream.stats.rememberedEvents).toBe(1);
});
