import type { Context } from 'hono';
import type { FeatureKey, Plan } from '@prisma/client';
import { PlanDowngradeLockedError } from '../errors';
import type { ModuleKey } from '../types/module.types';

export type PlanDowngradeLockReason = 'plan' | 'module' | 'feature';

export interface PlanDowngradeLockDetails {
  reason: PlanDowngradeLockReason;
  currentPlan?: Plan;
  requiredPlan?: Plan;
  module?: ModuleKey | string;
  featureKey?: FeatureKey;
}

export interface PlanDowngradeReadOnlyContext extends PlanDowngradeLockDetails {
  accessMode: 'read_only';
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isReadOnlyRequest(method: string): boolean {
  return READ_ONLY_METHODS.has(method.toUpperCase());
}

export function allowReadOnlyOrRejectDowngradeLock(
  c: Context,
  details: PlanDowngradeLockDetails,
): Response | null {
  const context: PlanDowngradeReadOnlyContext = {
    ...details,
    accessMode: 'read_only',
  };

  if (isReadOnlyRequest(c.req.method)) {
    c.set('planAccessMode', context.accessMode);
    c.set('planDowngradeLock', context);
    return null;
  }

  return c.json(new PlanDowngradeLockedError(context).toJSON(), 403);
}
