import { logger } from '../../../lib/logger.js';

export class WorkerLoop {
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly name: string, private readonly intervalMs: number, private readonly tick: () => Promise<void>) {}

  start(): void {
    if (this.timer || this.activeTick) return;
    this.stopping = false;
    logger.info(`[${this.name}] Started. intervalMs=${this.intervalMs}`);
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeTick;
    logger.info(`[${this.name}] Stopped.`);
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.activeTick = this.runTick();
    }, delayMs);
  }

  private async runTick(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker error';
      logger.error(`[${this.name}] Tick failed: ${message}`);
    } finally {
      this.activeTick = null;
      this.schedule(this.intervalMs);
    }
  }
}
