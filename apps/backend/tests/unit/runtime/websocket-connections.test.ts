import { describe, expect, it, vi } from 'vitest';
import { WebSocketConnections } from '../../../src/modules/collaboration/chat/infrastructure/realtime/websocket-connections.js';

describe('WebSocket deployment drain', () => {
  it('waits for all close acknowledgements before resolving the shutdown', async () => {
    const connections = new WebSocketConnections();
    const first = { close: vi.fn() }; const second = { close: vi.fn() };
    connections.add(first); connections.add(second);
    let finished = false;
    const drained = connections.drain().then(() => { finished = true; });
    expect(first.close).toHaveBeenCalledWith(1012, 'Service restart');
    connections.remove(first); await Promise.resolve();
    expect(finished).toBe(false);
    connections.remove(second); await drained;
    expect(finished).toBe(true);
  });
  it('closes a late connection and includes it in the pending drain', async () => {
    const connections = new WebSocketConnections();
    const first = { close: vi.fn() }; const late = { close: vi.fn() };
    connections.add(first);
    let finished = false;
    const drained = connections.drain().then(() => { finished = true; });
    connections.add(late); connections.remove(first); await Promise.resolve();
    expect(late.close).toHaveBeenCalledWith(1012, 'Service restart');
    expect(finished).toBe(false);
    connections.remove(late); await drained;
  });
  it('handles an empty or repeated drain safely', async () => {
    const connections = new WebSocketConnections();
    await connections.drain(); await connections.drain();
    expect(connections.isDraining).toBe(true);
  });
});
