/** Fixed windows bound refetch frequency without starving a continuous event stream. */
export function createRealtimeRefresh(refresh: () => void, intervalMs = 100) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  return {
    notify(payload: unknown): void {
      if (disposed || !payload || typeof payload !== 'object' || !('type' in payload) || typeof payload.type !== 'string' || payload.type === 'pong') return;
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; if (!disposed) refresh(); }, intervalMs);
    },
    dispose(): void { disposed = true; if (timer) clearTimeout(timer); timer = undefined; },
  };
}
