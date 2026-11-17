interface WebSocketConnection { close(code: number, reason: string): void }

export class WebSocketConnections {
  private readonly sockets = new Set<WebSocketConnection>();
  private readonly waiters = new Set<() => void>();
  private draining = false;

  get isDraining(): boolean { return this.draining; }

  add(socket: WebSocketConnection): void {
    this.sockets.add(socket);
    if (this.draining) socket.close(1012, 'Service restart');
  }

  remove(socket: WebSocketConnection): void {
    this.sockets.delete(socket);
    if (this.sockets.size === 0) {
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
    }
  }

  drain(): Promise<void> {
    this.draining = true;
    if (this.sockets.size === 0) return Promise.resolve();
    const finished = new Promise<void>((resolve) => { this.waiters.add(resolve); });
    for (const socket of this.sockets) socket.close(1012, 'Service restart');
    return finished;
  }
}
