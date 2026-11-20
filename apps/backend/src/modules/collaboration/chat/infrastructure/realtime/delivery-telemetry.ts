import { countTelemetry, observeTelemetry, setTelemetryGauge } from '../../../../../lib/telemetry/metrics.js';
export interface RealtimeDeliveryConnection {
  enable(): void;
  sent(id: string, createdAt: number): void;
  acknowledge(id: string): void;
  close(): void;
}
interface Connection {
  enabled: boolean;
  pending: Map<string, {
    createdAt: number;
    deadline: number;
  }>;
}
let reportedPending = 0, reportedEnabled = 0;
/** Optional transport receipts. Legacy clients remain untracked, never assumed delivered. */
export class RealtimeDeliveryTelemetry {
  private readonly connections = new Map<number, Connection>();
  private nextId = 0;
  private pending = 0;
  private enabled = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private publishedPending = 0;
  private publishedEnabled = 0;
  constructor(private readonly now: () => number = Date.now) { this.gauges(); }
  private gauges(): void {
    reportedPending += this.pending - this.publishedPending;
    reportedEnabled += this.enabled - this.publishedEnabled;
    this.publishedPending = this.pending;
    this.publishedEnabled = this.enabled;
    setTelemetryGauge('axon_realtime_pending_acknowledgements', reportedPending);
    setTelemetryGauge('axon_realtime_ack_enabled_connections', reportedEnabled);
  }
  open(): RealtimeDeliveryConnection {
    const id = ++this.nextId;
    const state: Connection = { enabled: false, pending: new Map() };
    // The transport/poller enforces the same connection cap.
    if (this.connections.size < 10000)
      this.connections.set(id, state);
    const active = () => this.connections.has(id);
    return {
      enable: () => {
        if (!active() || state.enabled)
          return;
        state.enabled = true;
        this.enabled++;
        this.gauges();
        if (!this.timer) {
          this.timer = setInterval(() => this.expire(), 1000);
          this.timer.unref();
        }
      },
      sent: (eventId, createdAt) => {
        if (!active() || !state.enabled || state.pending.has(eventId))
          return;
        if (state.pending.size >= 128 || this.pending >= 4096 || eventId.length > 128 || !Number.isFinite(createdAt) || createdAt <= 0) {
          countTelemetry('axon_realtime_ack_tracking_overflow_total');
          countTelemetry('axon_realtime_unconfirmed_deliveries_total');
          return;
        }
        state.pending.set(eventId, { createdAt, deadline: this.now() + 5000 });
        this.pending++;
        this.gauges();
      },
      acknowledge: eventId => {
        if (!active() || !state.enabled)
          return;
        const event = state.pending.get(eventId);
        if (!event) {
          countTelemetry('axon_realtime_unknown_acknowledgements_total');
          return;
        }
        state.pending.delete(eventId);
        this.pending--;
        this.gauges();
        // Enforce the deadline here as well as in the periodic sweep. A delayed
        // sweep must not turn an expired receipt into a confirmed delivery.
        if (event.deadline <= this.now()) {
          countTelemetry('axon_realtime_unconfirmed_deliveries_total');
          countTelemetry('axon_realtime_unknown_acknowledgements_total');
          return;
        }
        countTelemetry('axon_realtime_confirmed_deliveries_total');
        observeTelemetry('axon_realtime_ack_latency_seconds', Math.max(0, this.now() - event.createdAt) / 1000, {});
      },
      close: () => {
        if (!active())
          return;
        this.connections.delete(id);
        if (state.enabled)
          this.enabled--;
        this.pending -= state.pending.size;
        countTelemetry('axon_realtime_unconfirmed_deliveries_total', state.pending.size);
        state.pending.clear();
        this.gauges();
        if (!this.enabled && this.timer) {
          clearInterval(this.timer);
          this.timer = undefined;
        }
      },
    };
  }
  expire(): void {
    const now = this.now();
    for (const connection of this.connections.values())
      for (const [id, event] of connection.pending) {
        if (event.deadline > now)
          continue;
        connection.pending.delete(id);
        this.pending--;
        countTelemetry('axon_realtime_unconfirmed_deliveries_total');
      }
    this.gauges();
  }
  stop(): void {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = undefined;
    countTelemetry('axon_realtime_unconfirmed_deliveries_total', this.pending);
    this.connections.clear();
    this.pending = 0;
    this.enabled = 0;
    this.gauges();
  }
}
