import { createRequire } from 'node:module';
import type { PerformanceActor } from '../../packages/types/src/performance.js';
import { object } from './validation.js';
import { Measurements } from './measurements.js';

interface Socket { on(event: string, listener: (...args: unknown[]) => void): Socket; close(code?: number): void; send(data: string): void; terminate(): void }
interface SocketConstructor { new(url: string, options: { headers: Record<string, string>; handshakeTimeout: number }): Socket }
function socketConstructor(): SocketConstructor {
  const value: unknown = createRequire(import.meta.url)('ws');
  if (typeof value !== 'function' || !['on', 'close', 'send', 'terminate'].every((key) => typeof Reflect.get(object(Reflect.get(value, 'prototype')), key) === 'function')) throw new Error('The backend ws runtime is required.');
  return value as SocketConstructor;
}
export async function openRealtime(origin: string, actor: PerformanceActor, vu: number, metrics: Measurements): Promise<() => Promise<void>> {
  const Socket = socketConstructor();
  const url = new URL('/api/chat/ws', origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new Socket(url.href, { headers: { Authorization: `Bearer ${actor.token}`, Origin: 'https://phase8.example.test', Host: 'phase8.example.test', 'x-forwarded-for': `10.1.${Math.floor(vu / 256)}.${vu % 256}` }, handshakeTimeout: 15_000 });
  let opened = false; let stopping = false; let heartbeat: ReturnType<typeof setInterval> | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    socket.on('open', () => { opened = true; metrics.messageProof.connect(vu, actor.tenantId, actor.conversationId); metrics.sockets++; metrics.maximumSockets = Math.max(metrics.maximumSockets, metrics.sockets); heartbeat = setInterval(() => { if (opened && !stopping) { socket.send('ping'); if (metrics.isMeasuring()) metrics.pings++; } }, 5_000); resolve(); });
    socket.on('error', () => { if (!stopping) metrics.socketFailures++; reject(new Error('WebSocket handshake or transport failed.')); });
    socket.on('close', () => { metrics.messageProof.disconnect(vu); if (heartbeat) clearInterval(heartbeat); if (opened) { opened = false; metrics.sockets--; } if (!stopping) metrics.socketFailures++; reject(new Error('WebSocket closed during workload.')); });
    socket.on('message', (data: unknown) => {
      if (!Buffer.isBuffer(data)) return;
      try {
        const body = object(JSON.parse(data.toString('utf8')) as unknown);
        if (typeof body.tenantId === 'string' && body.tenantId !== actor.tenantId) metrics.violations++;
        const payload = body.payload && typeof body.payload === 'object' ? object(body.payload) : {};
        if (body.type === 'message.created' && typeof payload.clientMessageId === 'string' && metrics.messageProof.observe(vu, payload.clientMessageId) && typeof body.occurredAt === 'string') {
          const verifiedDelay = Date.now() - Date.parse(body.occurredAt);
          if (Number.isFinite(verifiedDelay) && verifiedDelay >= 0) metrics.verifiedDelivery.record(verifiedDelay);
        }
        if (!metrics.isMeasuring()) return;
        if (body.type === 'pong') metrics.pongs++;
        if (body.type === 'message.created' && typeof body.occurredAt === 'string') {
          const delay = Date.now() - Date.parse(body.occurredAt);
          if (Number.isFinite(delay) && delay >= 0) { metrics.delivery.record(delay); metrics.messages++; }
        }
      } catch { metrics.socketFailures++; }
    });
  });
  try { await ready; }
  catch (error) { stopping = true; socket.terminate(); throw error; }
  return async () => {
    stopping = true; if (heartbeat) clearInterval(heartbeat);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { socket.terminate(); resolve(); }, 3_000);
      socket.on('close', () => { metrics.messageProof.disconnect(vu); clearTimeout(timeout); resolve(); }); socket.close(1000);
    });
  };
}
