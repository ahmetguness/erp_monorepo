import type { AuthUser } from '@repo/types';
import { describe, expect, it } from 'vitest';
import { createUserAccessContext, hasUserPermission } from '../../../src/domain/access/user-access-context';

function user(membership: AuthUser['tenantMembership']): AuthUser {
  return { id: 'user-1', email: 'user@example.com', name: 'User', phone: null, isActive: true, tenantMembership: membership };
}

describe('user access context', () => {
  it('grants all permissions to owners', () => {
    const context = createUserAccessContext(user({ isOwner: true, roleId: null, role: null }));
    expect(hasUserPermission(context, 'accounting', 'DELETE')).toBe(true);
  });

  it('matches role permissions and rejects missing actions', () => {
    const context = createUserAccessContext(user({
      isOwner: false,
      roleId: 'role-1',
      role: { id: 'role-1', name: 'Sales', isSystem: false, permissions: [{ module: 'sales', action: 'READ' }] },
    }));
    expect(hasUserPermission(context, 'sales', 'READ')).toBe(true);
    expect(hasUserPermission(context, 'sales', 'DELETE')).toBe(false);
  });

  it('preserves legacy sessions without membership and rejects anonymous users', () => {
    expect(hasUserPermission(createUserAccessContext(user(undefined)), 'sales', 'READ')).toBe(true);
    expect(hasUserPermission(null, 'sales', 'READ')).toBe(false);
  });
});
