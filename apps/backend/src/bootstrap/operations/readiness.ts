export type DependencyStatus = 'up' | 'down';
export interface ReadinessProbe {
  name: string;
  check(signal: AbortSignal): Promise<void>;
}
export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Readonly<Record<string, DependencyStatus>>;
}

/** Single-flight probes prevent health polling from exhausting database pools. */
export class ReadinessMonitor {
  private pending: Promise<ReadinessReport> | undefined;
  private cached: { at: number; report: ReadinessReport } | undefined;
  private draining = false;

  constructor(private readonly probes: readonly ReadinessProbe[], private readonly cacheMs = 2_000) {}

  beginDrain(): void { this.draining = true; this.cached = undefined; }

  async read(): Promise<ReadinessReport> {
    if (this.draining) return { status: 'not_ready', checks: { lifecycle: 'down' } };
    if (this.cached && Date.now() - this.cached.at < this.cacheMs) return this.cached.report;
    if (!this.pending) {
      this.pending = this.probe().then((report) => {
        this.cached = { at: Date.now(), report };
        return report;
      }).finally(() => { this.pending = undefined; });
    }
    const report = await this.pending;
    return this.draining ? { status: 'not_ready', checks: { lifecycle: 'down' } } : report;
  }

  private async probe(): Promise<ReadinessReport> {
    const checks: Record<string, DependencyStatus> = {};
    await Promise.all(this.probes.map(async ({ name, check }) => {
      try { await check(AbortSignal.timeout(3_000)); checks[name] = 'up'; }
      catch { checks[name] = 'down'; }
    }));
    return { status: Object.values(checks).every((status) => status === 'up') ? 'ready' : 'not_ready', checks };
  }
}
