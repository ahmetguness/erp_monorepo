import { afterEach, expect, it, vi } from 'vitest';
import { bindRealtimeSession } from '@/features/chat/model/realtime-session';
class TestSocket {
  static sockets: TestSocket[] = [];
  onmessage: ((event: {
    data: unknown;
  }) => void) | null = null;
  onclose: ((event: {
    code: number;
  }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  sent: string[] = [];
  constructor() { TestSocket.sockets.push(this); }
  send(value: string) { this.sent.push(value); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); TestSocket.sockets = []; });
it('closes A synchronously on A→B→A, rejects delayed frames, and removes all sockets/timers on unmount', () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', TestSocket);
  let identity: string | null = 'A';
  let notify: () => void = () => undefined;
  const unsubscribe = vi.fn();
  const refresh = vi.fn();
  const stop = bindRealtimeSession({ currentIdentity: () => identity, subscribe: changed => { notify = changed; return unsubscribe; }, url: 'ws://localhost', refresh });
  const a = TestSocket.sockets[0];
  const oldMessage = a.onmessage;
  a.onopen?.();
  a.onmessage?.({ data: '{"type":"message.created"}' });
  identity = 'B';
  notify();
  identity = 'A';
  notify();
  expect(a.readyState).toBe(3);
  expect(TestSocket.sockets).toHaveLength(3);
  oldMessage?.({ data: '{"type":"message.created"}' });
  vi.advanceTimersByTime(100);
  expect(refresh).not.toHaveBeenCalled();
  const latest = TestSocket.sockets[2];
  latest.onopen?.();
  latest.onmessage?.({ data: '{"type":"message.created"}' });
  vi.advanceTimersByTime(100);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(latest.readyState).toBe(3);
  expect(vi.getTimerCount()).toBe(0);
});
it('detects missed heartbeat and reconnects with bounded backoff, stopping on authentication rejection', () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', TestSocket);
  const stop = bindRealtimeSession({ currentIdentity: () => 'A', subscribe: () => () => undefined, url: 'ws://localhost', refresh: vi.fn() });
  const first = TestSocket.sockets[0];
  first.onopen?.();
  vi.advanceTimersByTime(20000);
  expect(first.sent).toEqual([JSON.stringify({ type: 'telemetry.capabilities', version: 1, deliveryAck: true }), 'ping']);
  vi.advanceTimersByTime(20000);
  expect(first.readyState).toBe(3);
  vi.advanceTimersByTime(1500);
  expect(TestSocket.sockets).toHaveLength(2);
  TestSocket.sockets[1].close(4401);
  vi.advanceTimersByTime(60000);
  expect(TestSocket.sockets).toHaveLength(2);
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not refresh or acknowledge another tenant and acknowledges only validated current-session delivery metadata', () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', TestSocket);
  const refresh = vi.fn();
  const stop = bindRealtimeSession({ currentIdentity: () => 'A', currentTenantId: () => 'tenant-A', subscribe: () => () => undefined, url: 'ws://localhost', refresh });
  const socket = TestSocket.sockets[0];
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ type: 'message.created', tenantId: 'tenant-B', id: 'foreign', version: 1 }) });
  vi.advanceTimersByTime(100);
  expect(refresh).not.toHaveBeenCalled();
  expect(socket.sent).toHaveLength(1);
  socket.onmessage?.({ data: JSON.stringify({ type: 'message.created', tenantId: 'tenant-A', id: 'valid-delivery', version: 1 }) });
  vi.advanceTimersByTime(100);
  expect(refresh).toHaveBeenCalledOnce();
  expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'event.ack', id: 'valid-delivery' }));
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
