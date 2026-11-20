import { setTelemetryGauge } from '../../lib/telemetry/metrics.js';
import { withinProbeDeadline } from '../../lib/probe-deadline.js';
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
  private readonly inFlight = new Set<string>();

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
      try {
        if (this.inFlight.has(name)) throw new Error('Previous probe is still pending');
        this.inFlight.add(name);
        const work = Promise.resolve().then(() => check(AbortSignal.timeout(3000)));
        void work.then(() => this.inFlight.delete(name), () => this.inFlight.delete(name));
        await withinProbeDeadline(work);
        checks[name] = 'up';
      }
      catch { checks[name] = 'down'; }
      const dependency = name === 'objectStorage' ? 'storage' : name === 'workers' ? 'worker' : name;
      if (['database', 'redis', 'storage', 'worker'].includes(dependency)) setTelemetryGauge('axon_dependency_up', checks[name] === 'up' ? 1 : 0, { dependency });
    }));
    return { status: Object.values(checks).every((status) => status === 'up') ? 'ready' : 'not_ready', checks };
  }
}
