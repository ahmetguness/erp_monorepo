import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../src/store/ui.store';

describe('UI toast deduplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useUIStore.setState({ toasts: [] });
  });

  it('keeps the first toast when the same request reports the same error twice', () => {
    const message = `trial-expired-${crypto.randomUUID()}`;
    const checkoutAction = { label: 'Tam Sürüme Geç', href: '/checkout?billing=annual&source=tenant' };

    useUIStore.getState().toast.warning(message, checkoutAction);
    useUIStore.getState().toast.error(message);

    expect(useUIStore.getState().toasts).toEqual([
      expect.objectContaining({ variant: 'warning', message, action: checkoutAction }),
    ]);
  });

  it('allows the same warning for a later user action', () => {
    const message = `trial-expired-${crypto.randomUUID()}`;

    useUIStore.getState().toast.warning(message);
    vi.advanceTimersByTime(501);
    useUIStore.getState().toast.warning(message);

    expect(useUIStore.getState().toasts).toHaveLength(2);
  });
});
