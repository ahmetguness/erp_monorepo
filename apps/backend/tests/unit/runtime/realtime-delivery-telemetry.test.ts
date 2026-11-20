import { afterEach, expect, it, vi } from 'vitest';
import { RealtimeDeliveryTelemetry } from '../../../src/modules/collaboration/chat/infrastructure/realtime/delivery-telemetry.js';
import { telemetryMetricsText } from '../../../src/lib/telemetry/metrics.js';
afterEach(() => vi.useRealTimers());
it('confirms only events sent on the same negotiated connection and aggregates gateways', () => {
  vi.useFakeTimers();
  let at = 10000;
  const first = new RealtimeDeliveryTelemetry(() => at), second = new RealtimeDeliveryTelemetry(() => at);
  try {
    const a = first.open(), b = second.open(), legacy = first.open();
    a.enable();
    b.enable();
    legacy.sent('legacy-event', at);
    a.sent('event-a', at);
    b.sent('event-b', at);
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 2');
    b.acknowledge('event-a');
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 2');
    at += 100;
    a.acknowledge('event-a');
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 1');
    a.close();
    a.close();
    expect(telemetryMetricsText()).toContain('axon_realtime_ack_enabled_connections{} 1');
    b.acknowledge('event-b');
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 0');
  }
  finally {
    first.stop();
    second.stop();
  }
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds pending receipts and exposes missing deliveries, without disconnecting legacy clients', () => {
  vi.useFakeTimers();
  let at = 10000;
  const tracker = new RealtimeDeliveryTelemetry(() => at);
  try {
    const connection = tracker.open();
    connection.enable();
    for (let index = 0; index < 129; index++)
      connection.sent(`event-${index}`, at);
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 128');
    expect(telemetryMetricsText()).toContain('axon_realtime_ack_tracking_overflow_total 1');
    at += 5001;
    tracker.expire();
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 0');
    expect(telemetryMetricsText()).toContain('axon_realtime_unconfirmed_deliveries_total 129');
  }
  finally {
    tracker.stop();
  }
});

it('does not confirm an acknowledgement after its deadline when expiry timer has not run', () => {
  vi.useFakeTimers();
  let at = 10000;
  const counter = (name: string) => Number(new RegExp('^' + name + ' (\\d+)$', 'm').exec(telemetryMetricsText())?.[1] ?? '0');
  const confirmed = counter('axon_realtime_confirmed_deliveries_total');
  const unconfirmed = counter('axon_realtime_unconfirmed_deliveries_total');
  const tracker = new RealtimeDeliveryTelemetry(() => at);
  try {
    const connection = tracker.open();
    connection.enable();
    connection.sent('late-event', at);
    at += 5000;
    connection.acknowledge('late-event');
    expect(counter('axon_realtime_confirmed_deliveries_total')).toBe(confirmed);
    expect(counter('axon_realtime_unconfirmed_deliveries_total')).toBe(unconfirmed + 1);
    expect(telemetryMetricsText()).toContain('axon_realtime_pending_acknowledgements{} 0');
    tracker.expire();
    expect(counter('axon_realtime_unconfirmed_deliveries_total')).toBe(unconfirmed + 1);
  } finally { tracker.stop(); }
});
