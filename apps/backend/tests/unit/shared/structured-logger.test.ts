import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../../src/lib/logger.js';

const previousLogFormat = process.env.LOG_FORMAT;

afterEach(() => {
  if (previousLogFormat === undefined) delete process.env.LOG_FORMAT;
  else process.env.LOG_FORMAT = previousLogFormat;
  vi.restoreAllMocks();
});

describe('structured logger', () => {
  it('emits parseable JSON and redacts secret fields', () => {
    process.env.LOG_FORMAT = 'json';
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('export test', {
      correlationId: 'correlation-1',
      apiKey: 'must-not-leak',
      status: 200,
    });

    const line = output.mock.calls[0]?.[0];
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(String(line)) as Record<string, unknown>;
    expect(parsed.message).toBe('export test');
    expect(parsed.correlationId).toBe('correlation-1');
    expect(parsed.apiKey).toBe('[REDACTED]');
    expect(String(line)).not.toContain('must-not-leak');
  });
});
