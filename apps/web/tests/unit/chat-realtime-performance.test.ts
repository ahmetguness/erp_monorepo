import { afterEach, expect, it, vi } from 'vitest';
import { createRealtimeRefresh } from '@/features/chat/model/realtime-refresh';

afterEach(() => vi.useRealTimers());
it('coalesces a burst of chat notifications and ignores keepalive or malformed frames', () => {
  vi.useFakeTimers(); const refresh = vi.fn(); const batch = createRealtimeRefresh(refresh);
  batch.notify({ type: 'pong' }); batch.notify({}); batch.notify(null);
  vi.advanceTimersByTime(100); expect(refresh).not.toHaveBeenCalled();
  for (let index = 0; index < 100; index++) batch.notify({ type: 'message.created' });
  vi.advanceTimersByTime(100); expect(refresh).toHaveBeenCalledTimes(1);
  batch.notify({ type: 'connection.ready' }); vi.advanceTimersByTime(100); expect(refresh).toHaveBeenCalledTimes(2);
});
it('does not starve refreshes under sustained traffic or refetch after unmount', () => {
  vi.useFakeTimers(); const refresh = vi.fn(); const batch = createRealtimeRefresh(refresh);
  for (let index = 0; index < 10; index++) { batch.notify({ type: 'message.created' }); vi.advanceTimersByTime(50); }
  expect(refresh).toHaveBeenCalledTimes(5);
  batch.notify({ type: 'message.created' }); batch.dispose();
  vi.advanceTimersByTime(100); batch.notify({ type: 'message.created' }); vi.advanceTimersByTime(100);
  expect(refresh).toHaveBeenCalledTimes(5);
});
