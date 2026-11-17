import { logger } from '../../../lib/logger.js';
import { recordWorkerStarted, recordWorkerTick } from './worker-health.js';

export class WorkerLoop {
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly name: string, private readonly intervalMs: number, private readonly tick: () => Promise<void>) {}

  get isStopping(): boolean { return this.stopping; }

  start(): void {
    if (this.timer || this.activeTick) return;
    this.stopping = false;
    recordWorkerStarted(this.name, this.intervalMs);
    logger.info(`[${this.name}] Started. intervalMs=${this.intervalMs}`);
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    recordWorkerTick(this.name, 'stopped');
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
    recordWorkerTick(this.name, 'started');
    try {
      await this.tick();
      recordWorkerTick(this.name, 'succeeded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker error';
      logger.error(`[${this.name}] Tick failed: ${message}`);
    } finally {
      recordWorkerTick(this.name, 'finished');
      this.activeTick = null;
      this.schedule(this.intervalMs);
    }
  }
}
