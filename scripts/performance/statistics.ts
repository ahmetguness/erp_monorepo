export interface LatencySummary { count: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; totalMs: number }
/** Exact millisecond buckets, bounded memory even during a day-long soak. */
export class LatencyHistogram {
  private readonly buckets = new Uint32Array(60_002);
  private count = 0;
  private total = 0;
  private maximum = 0;
  record(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Invalid latency sample.');
    this.buckets[Math.min(60_001, Math.ceil(milliseconds))]++;
    this.count++; this.total += milliseconds; this.maximum = Math.max(this.maximum, milliseconds);
  }
  private percentile(percent: number): number {
    if (!this.count) return 0;
    const rank = Math.ceil(this.count * percent); let found = 0;
    for (let index = 0; index < this.buckets.length; index++) { found += this.buckets[index]; if (found >= rank) return index === 60_001 ? this.maximum : index; }
    return this.maximum;
  }
  summary(): LatencySummary { return { count: this.count, p50Ms: this.percentile(0.5), p95Ms: this.percentile(0.95), p99Ms: this.percentile(0.99), maxMs: this.maximum, totalMs: this.total }; }
}
