import jwt from 'jsonwebtoken';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { createSecuritySession } from '../../../src/services/security-hardening.service.js';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, request } from '../support/http.js';

isolatedDatabase();

test('F: role grant/revoke invalidates access for the same token immediately', async () => {
  const { a, b, limited, role } = await fixture();
  expect((await request('GET', '/api/products', limited)).status).toBe(403);
  const permissionId = await create(`/api/roles/${role.id}/permissions`, a.identity, { module: 'inventory', action: 'READ' });
  expect((await request('GET', '/api/products', limited)).status).toBe(200);
  expect((await request('DELETE', `/api/roles/${role.id}/permissions/${permissionId}`, b.identity)).status).toBe(404);
  expect((await request('DELETE', `/api/roles/${role.id}/permissions/${permissionId}`, a.identity)).status).toBe(200);
  expect((await request('GET', '/api/products', limited)).status).toBe(403);
  expect(await db.rolePermission.count({ where: { roleId: role.id, module: 'inventory' } })).toBe(0);
});

test('F: API key is tenant/scoped and immediately revocable', async () => {
  const { a, b } = await fixture();
  const key = data(await request('POST', '/api/api-keys', a.identity, { name: 'Read products', scopes: ['products:read'] }), 201, z.object({ id: z.string(), rawKey: z.string() }));
  const products = await request('GET', '/api/external/products', null, undefined, key.rawKey);
  const list = data(products, 200, z.array(z.object({ id: z.string() })));
  expect(list.map((product) => product.id)).toContain(a.product.id);
  expect(list.map((product) => product.id)).not.toContain(b.product.id);
  expect((await request('GET', '/api/external/contacts', null, undefined, key.rawKey)).status).toBe(403);
  expect((await request('POST', `/api/api-keys/${key.id}/revoke`, b.identity)).status).toBe(404);
  const revocations = await Promise.all([request('POST', `/api/api-keys/${key.id}/revoke`, a.identity), request('POST', `/api/api-keys/${key.id}/revoke`, a.identity)]);
  expect(revocations.map((result) => result.status)).toEqual([200, 200]);
  expect((await request('GET', '/api/external/products', null, undefined, key.rawKey)).status).toBe(401);
  expect((await db.apiKey.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: key.id } })).isActive).toBe(false);
});

test('F: plan quotas and disabled modules prevent new records without changing existing data', async () => {
  const { a } = await fixture();
  await db.tenantFeatureOverride.create({ data: { tenantId: a.tenant.id, featureKey: 'MAX_PRODUCTS', value: '1', isEnabled: true, reason: 'Cross-module quota fixture' } });
  expect((await request('POST', '/api/products', a.identity, { unitId: a.unit.id, code: 'OVER-LIMIT', name: 'Over limit', salesPrice: 1 })).status).toBe(403);
  expect(await db.product.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  await db.tenant.update({ where: { id: a.tenant.id }, data: { modules: ['CONTACTS'] } });
  // Disabled modules retain read access under the downgrade policy, but reject writes.
  expect((await request('GET', '/api/products', a.identity)).status).toBe(200);
  expect((await request('POST', '/api/products', a.identity, { unitId: a.unit.id, code: 'DISABLED', name: 'Disabled module' })).status).toBe(403);
  expect(await db.product.count({ where: { tenantId: a.tenant.id } })).toBe(1);
});

test('F: logout revokes a real security session even when its JWT remains unexpired', async () => {
  const { a } = await fixture();
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, { ipAddress: null, userAgent: 'cross-module assurance' });
  const identity = { token: jwt.sign({ userId: a.owner.id, tenantId: a.tenant.id, sessionId: session.id }, process.env.JWT_SECRET ?? '', { expiresIn: '1h' }) };
  expect((await request('GET', '/api/auth/me', identity)).status).toBe(200);
  expect((await request('POST', '/api/auth/logout', identity)).status).toBe(200);
  expect((await request('GET', '/api/auth/me', identity)).status).toBe(401);
});
