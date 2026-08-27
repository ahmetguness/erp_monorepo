import { Priority, ServiceStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateServiceRequestSla } from '../../../src/modules/workforce-service/domain/index.js';

describe('service request SLA', () => {
  const createdAt = new Date('2026-08-27T08:00:00.000Z');

  it.each([
    [Priority.CRITICAL, 2],
    [Priority.HIGH, 4],
    [Priority.MEDIUM, 24],
    [Priority.LOW, 72],
  ] as const)('uses the configured limit for %s priority', (priority, limitHours) => {
    const result = calculateServiceRequestSla(
      createdAt,
      priority,
      ServiceStatus.OPEN,
      null,
      new Date('2026-08-27T09:00:00.000Z'),
    );
    expect(result.limitHours).toBe(limitHours);
    expect(result.targetDate).toBe(new Date(createdAt.getTime() + limitHours * 3_600_000).toISOString());
  });

  it('uses the closed timestamp and reports a breached SLA', () => {
    const result = calculateServiceRequestSla(
      createdAt,
      Priority.CRITICAL,
      ServiceStatus.COMPLETED,
      new Date('2026-08-27T11:00:00.000Z'),
    );
    expect(result.isBreached).toBe(true);
    expect(result.remainingMinutes).toBe(-60);
  });

  it('uses the supplied clock for an unresolved request', () => {
    const result = calculateServiceRequestSla(
      createdAt,
      Priority.HIGH,
      ServiceStatus.IN_PROGRESS,
      null,
      new Date('2026-08-27T10:00:00.000Z'),
    );
    expect(result.isBreached).toBe(false);
    expect(result.remainingMinutes).toBe(120);
  });
});
