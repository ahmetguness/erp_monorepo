import { createRealtimeRefresh } from './realtime-refresh';
import { ChatRealtimeDeliveryMetadataSchema } from '@repo/types';
interface Options {
  currentIdentity(): string | null;
  currentTenantId?(): string | null;
  subscribe(changed: () => void): () => void;
  url: string;
  refresh(): void;
  openSocket?(url: string): WebSocket;
}
/** Store subscription closes the old transport synchronously, including A→B→A batches. */
export function bindRealtimeSession(options: Options): () => void {
  let identity: string | null = null;
  let generation = 0;
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let waitingForPong = false;
  let attempts = 0;
  let refresh = createRealtimeRefresh(options.refresh);
  const clearTransport = () => {
    if (retry)
      clearTimeout(retry);
    if (heartbeat)
      clearInterval(heartbeat);
    retry = undefined;
    heartbeat = undefined;
    waitingForPong = false;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.onerror = null;
      socket.close();
      socket = undefined;
    }
    refresh.dispose();
  };
  const connect = (epoch: number) => {
    if (stopped || epoch !== generation || !identity)
      return;
    const current = (options.openSocket ?? (url => new WebSocket(url)))(options.url);
    socket = current;
    current.onopen = () => {
      if (epoch !== generation || stopped) {
        current.close();
        return;
      }
      const reconnected = attempts > 0;
      attempts = 0;
      try {
        current.send(JSON.stringify({ type: 'telemetry.capabilities', version: 1, deliveryAck: true, ...(reconnected ? { reconnected: true } : {}) }));
      }
      catch {
        current.close();
        return;
      }
      heartbeat = setInterval(() => {
        if (epoch !== generation || stopped)
          return;
        if (waitingForPong) {
          current.close(4000, 'Heartbeat expired');
          return;
        }
        if (current.readyState === 1) {
          waitingForPong = true;
          current.send('ping');
        }
      }, 20000);
    };
    current.onmessage = event => {
      if (stopped || epoch !== generation || typeof event.data !== 'string')
        return;
      try {
        const payload: unknown = JSON.parse(event.data);
        const tenantId = options.currentTenantId?.();
        if (tenantId && payload && typeof payload === 'object' && 'tenantId' in payload && payload.tenantId !== tenantId)
          return;
        if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'pong')
          waitingForPong = false;
        refresh.notify(payload);
        const metadata = ChatRealtimeDeliveryMetadataSchema.safeParse(payload);
        if (metadata.success && current.readyState === 1) {
          try {
            current.send(JSON.stringify({ type: 'event.ack', id: metadata.data.id }));
          }
          catch {
            current.close();
          }
        }
      }
      catch { /* Frames never write directly into tenant data. */ }
    };
    current.onerror = () => current.close();
    current.onclose = event => {
      if (stopped || epoch !== generation)
        return;
      if (heartbeat)
        clearInterval(heartbeat);
      heartbeat = undefined;
      waitingForPong = false;
      if ([1008, 4001, 4401, 4403].includes(event.code))
        return;
      const delay = Math.min(30000, 1500 * 2 ** Math.min(attempts++, 5));
      retry = setTimeout(() => connect(epoch), delay);
    };
  };
  const changed = () => {
    const next = options.currentIdentity();
    if (next === identity || stopped)
      return;
    identity = next;
    generation++;
    clearTransport();
    attempts = 0;
    refresh = createRealtimeRefresh(options.refresh);
    if (identity)
      connect(generation);
  };
  const unsubscribe = options.subscribe(changed);
  changed();
  return () => { stopped = true; generation++; unsubscribe(); clearTransport(); };
}
