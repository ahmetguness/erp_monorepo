import { z } from 'zod';

export const resourceMetricResponses = z.array(z.object({ status: z.number().int().min(0).max(599), text: z.string().max(2_000_000) })).max(5);
type MetricResponse = z.infer<typeof resourceMetricResponses>[number];
const scalarFamilies = /^axon_(?:process_|event_loop_|database_|serializable_|telemetry_|log_|operational_probe_|outbox_|storage_|audit_|business_|realtime_)/;

/** Prometheus owns the histogram history; resource history needs bounded scalar
 * health/cost counters. Full raw metrics are separately saved per phase. */
export function resourceMetricsHistory(responses: readonly MetricResponse[]): MetricResponse[] {
  return responses.map(response => ({
    status: response.status,
    text: response.text.split(/\r?\n/).filter(line => {
      const name = /^(axon_[a-zA-Z0-9_:]+)(?:\{|\s)/.exec(line)?.[1];
      return name !== undefined && scalarFamilies.test(name) && !/_(?:bucket|sum|count)$/.test(name);
    }).join('\n') + '\n',
  }));
}
