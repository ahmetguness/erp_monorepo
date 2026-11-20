import { z } from 'zod';

const phase = z.object({ phase: z.string() });
const metrics = z.object({
  unavailable: z.literal(false).optional(),
  api: z.array(z.object({ status: z.literal(200), text: z.string() })),
});
const healthyCounters = [
  'axon_telemetry_export_failures_total', 'axon_telemetry_dropped_spans_total',
  'axon_log_export_failures_total', 'axon_log_export_dropped_total',
];
const exportedPoint = z.array(z.object({
  metric: z.object({ __name__: z.string() }),
  value: z.tuple([z.number().finite(), z.string().transform(Number).pipe(z.number().finite().nonnegative())]),
}));

export function actualTelemetryExportObserved(points: unknown): boolean {
  const parsed = exportedPoint.safeParse(points);
  return parsed.success && ['axon_telemetry_exported_spans_total', 'axon_log_exported_total'].every(name =>
    parsed.data.some(point => point.metric.__name__ === name && point.value[1] > 0),
  );
}

/** Collection must stay healthy throughout a measured stage, including its worker. */
export function telemetryHealthy(samples: readonly unknown[], stage: string, targets: number): boolean {
  const selected = samples.filter(sample => {
    const parsed = phase.safeParse(sample);
    return parsed.success && parsed.data.phase === stage;
  });
  return selected.length > 0 && selected.every(sample => {
    const parsed = metrics.safeParse(sample);
    return parsed.success && parsed.data.api.length === targets && parsed.data.api.every(response =>
      /^axon_operational_probe_up 1\r?$/m.test(response.text)
      && healthyCounters.every(name => new RegExp('^' + name + ' 0\\r?$', 'm').test(response.text)),
    );
  });
}
