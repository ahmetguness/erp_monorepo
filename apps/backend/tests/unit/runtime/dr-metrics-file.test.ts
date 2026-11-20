import { expect, it } from 'vitest';
import { validatedDrMetrics } from '../../../src/modules/platform/application/observability/dr-metrics-file.js';
it('never turns missing, partial, labelled or arbitrary file contents into healthy DR telemetry', () => {
  expect(validatedDrMetrics('axon_dr_probe_up 0\n')).toContain('axon_dr_probe_up 0');
  for (const text of ['private-secret-value', 'axon_dr_probe_up 1\n', 'axon_dr_probe_up{tenantId="private"} 0\n', 'axon_dr_probe_up 0\naxon_dr_probe_up 1\n', 'axon_dr_probe_up NaN\n'])
    expect(() => validatedDrMetrics(text)).toThrow();
});
