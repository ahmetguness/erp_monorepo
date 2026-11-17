export interface ShutdownResources {
  drain(): void;
  stopAccepting(): Promise<void>;
  stopWorkers(): Promise<void>;
  disconnect(): Promise<void>;
  forceClose(): void;
}

/** HTTP and jobs drain before connections close; repeated signals share one shutdown. */
export class ProcessLifecycle {
  private shutdownTask: Promise<void> | undefined;
  constructor(private readonly resources: ShutdownResources, private readonly timeoutMs = 360_000) {}

  shutdown(): Promise<void> {
    this.shutdownTask ??= this.close();
    return this.shutdownTask;
  }

  private async close(): Promise<void> {
    this.resources.drain();
    const timeout = setTimeout(() => { this.resources.forceClose(); }, this.timeoutMs);
    try {
      await Promise.all([this.resources.stopAccepting(), this.resources.stopWorkers()]);
      await this.resources.disconnect();
    } finally { clearTimeout(timeout); }
  }
}
