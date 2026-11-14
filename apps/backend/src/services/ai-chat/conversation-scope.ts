import { createHash } from 'node:crypto';
import type { UserPermissions } from './tool-access.policy.js';

/** An in-flight response from an old role writes only to its old history scope. */
export function privateConversationKey(tenantId: string, userId: string, plan: string, permissions: UserPermissions, modules: readonly string[]): string {
  const scope = JSON.stringify([plan, permissions.isOwner, [...modules].sort(), permissions.modules.map((entry) => `${entry.module}:${entry.action}`).sort()]);
  return `private:${tenantId}:${userId}:${createHash('sha256').update(scope).digest('hex')}`;
}
