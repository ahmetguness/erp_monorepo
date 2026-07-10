import { Context, Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { Plan, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const scimRoutes = new Hono<{ Variables: { tenantId: string } }>();

type ScimPatchOperation = { op: string; path?: string; value?: unknown };
type ScimRoleMapping = { group: string; roleId: string };
type ScimMember = { value?: string; display?: string; primary?: boolean };
type ScimUserPayload = {
  userName?: string;
  active?: boolean;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  emails?: ScimMember[];
  groups?: ScimMember[];
  roles?: ScimMember[];
  Operations?: ScimPatchOperation[];
};
type ScimGroupPayload = {
  displayName?: string;
  members?: ScimMember[];
  Operations?: ScimPatchOperation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonRecord(c: Context): Promise<Record<string, unknown> | null> {
  const body = await c.req.json<unknown>().catch(() => null);
  return isRecord(body) ? body : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readMembers(value: unknown): ScimMember[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((item) => ({
    value: readString(item.value),
    display: readString(item.display),
    primary: readBoolean(item.primary),
  }));
}

function readOperations(value: unknown): ScimPatchOperation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((operation) => ({
    op: readString(operation.op) ?? '',
    path: readString(operation.path),
    value: operation.value,
  })).filter((operation) => operation.op.length > 0);
}

function readUserPayload(body: Record<string, unknown>): ScimUserPayload {
  const name = isRecord(body.name) ? body.name : {};
  return {
    userName: readString(body.userName),
    active: readBoolean(body.active),
    name: {
      formatted: readString(name.formatted),
      givenName: readString(name.givenName),
      familyName: readString(name.familyName),
    },
    emails: readMembers(body.emails),
    groups: readMembers(body.groups),
    roles: readMembers(body.roles),
    Operations: readOperations(body.Operations),
  };
}

function readGroupPayload(body: Record<string, unknown>): ScimGroupPayload {
  return {
    displayName: readString(body.displayName),
    members: readMembers(body.members),
    Operations: readOperations(body.Operations),
  };
}

function scimError(c: Context, detail: string, status: 400 | 401 | 403 | 404 | 500): Response {
  return c.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    detail,
    status: String(status),
  }, status);
}

function userEmail(payload: ScimUserPayload): string | undefined {
  return payload.userName ?? payload.emails?.find((email) => email.primary)?.value ?? payload.emails?.[0]?.value;
}

function userDisplayName(payload: ScimUserPayload, fallback: string): string {
  const combined = `${payload.name?.givenName ?? ''} ${payload.name?.familyName ?? ''}`.trim();
  return payload.name?.formatted ?? (combined || fallback);
}

function scimUserResource(
  user: { id: string; email: string; name: string; isActive: boolean },
  tenantUser?: { roleRef?: { id: string; name: string } | null },
) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: {
      formatted: user.name,
      familyName: user.name.split(' ').pop() || '',
      givenName: user.name.split(' ').slice(0, -1).join(' ') || user.name,
    },
    emails: [{ value: user.email, primary: true }],
    active: user.isActive,
    groups: tenantUser?.roleRef ? [{ value: tenantUser.roleRef.id, display: tenantUser.roleRef.name }] : [],
  };
}

function scimGroupResource(
  role: { id: string; name: string },
  users: Array<{ user: { id: string; email: string; name: string } }> = [],
) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: role.id,
    displayName: role.name,
    members: users.map((member) => ({
      value: member.user.id,
      display: member.user.name,
      '$ref': `/api/scim/v2/Users/${member.user.id}`,
    })),
  };
}

async function readRoleMappings(tenantId: string): Promise<ScimRoleMapping[]> {
  const setting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'security.scim.role_mappings' } },
    select: { value: true },
  });
  if (!setting?.value) return [];
  const parsed = (() => {
    try {
      return JSON.parse(setting.value) as unknown;
    } catch {
      return [];
    }
  })();
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord).map((item) => ({
    group: readString(item.group) ?? '',
    roleId: readString(item.roleId) ?? '',
  })).filter((item) => item.group.length > 0 && item.roleId.length > 0);
}

async function defaultRoleId(tenantId: string): Promise<string | null> {
  const setting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'security.scim.default_role_id' } },
    select: { value: true },
  });
  return setting?.value || null;
}

async function ensureRoleBelongsToTenant(tenantId: string, roleId: string | null): Promise<string | null> {
  if (!roleId) return null;
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } });
  return role?.id ?? null;
}

async function resolveScimRoleId(tenantId: string, payload: ScimUserPayload): Promise<string | null> {
  const roleSync = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'security.scim.role_sync.enabled' } },
    select: { value: true },
  });

  if (roleSync?.value !== 'true') {
    return ensureRoleBelongsToTenant(tenantId, await defaultRoleId(tenantId));
  }

  const externalGroups = [...(payload.groups ?? []), ...(payload.roles ?? [])]
    .flatMap((item) => [item.value, item.display])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const mappings = await readRoleMappings(tenantId);
  const matchedMapping = mappings.find((mapping) => externalGroups.some((group) => group.toLocaleLowerCase('tr-TR') === mapping.group.toLocaleLowerCase('tr-TR')));
  if (matchedMapping) return ensureRoleBelongsToTenant(tenantId, matchedMapping.roleId);

  const directRole = await prisma.role.findFirst({
    where: { tenantId, name: { in: externalGroups } },
    select: { id: true },
  });
  if (directRole) return directRole.id;
  return ensureRoleBelongsToTenant(tenantId, await defaultRoleId(tenantId));
}

function roleSyncPatchPayload(payload: ScimUserPayload): ScimUserPayload {
  const patched: ScimUserPayload = { ...payload };
  for (const operation of payload.Operations ?? []) {
    if (operation.op.toLowerCase() !== 'replace' && operation.op.toLowerCase() !== 'add') continue;
    if (isRecord(operation.value)) {
      if (Array.isArray(operation.value.groups)) patched.groups = readMembers(operation.value.groups);
      if (Array.isArray(operation.value.roles)) patched.roles = readMembers(operation.value.roles);
      if (typeof operation.value.active === 'boolean') patched.active = operation.value.active;
    }
    if ((operation.path === 'groups' || operation.path === 'roles') && Array.isArray(operation.value)) {
      const members = readMembers(operation.value);
      if (operation.path === 'groups') patched.groups = members;
      if (operation.path === 'roles') patched.roles = members;
    }
    if (operation.path === 'active' && typeof operation.value === 'boolean') patched.active = operation.value;
  }
  return patched;
}

async function updateGroupMembers(tenantId: string, roleId: string, memberIds: readonly string[]): Promise<void> {
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } });
  if (!role) throw new Error('ROLE_NOT_FOUND');
  const validMembers = await prisma.tenantUser.findMany({
    where: { tenantId, userId: { in: [...new Set(memberIds)] } },
    select: { id: true, userId: true },
  });
  const validMemberIds = new Set(validMembers.map((member) => member.userId));
  await prisma.tenantUser.updateMany({
    where: { tenantId, roleId },
    data: { roleId: null },
  });
  if (validMemberIds.size > 0) {
    await prisma.tenantUser.updateMany({
      where: { tenantId, userId: { in: [...validMemberIds] } },
      data: { roleId },
    });
  }
}

scimRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return scimError(c, 'SCIM Bearer token eksik.', 401);

  const token = authHeader.slice(7).trim();
  if (!token) return scimError(c, 'Gecersiz token.', 401);

  const setting = await prisma.tenantSetting.findFirst({
    where: { key: 'security.scim.token', value: token },
    select: { tenantId: true },
  });
  if (!setting) return scimError(c, 'Yetkisiz SCIM token.', 401);

  const tenant = await prisma.tenant.findUnique({ where: { id: setting.tenantId }, select: { plan: true } });
  if (tenant?.plan !== Plan.ENTERPRISE) return scimError(c, 'SCIM sadece Enterprise plan icindir.', 403);

  const enabled = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: setting.tenantId, key: 'security.scim.enabled' } },
    select: { value: true },
  });
  if (enabled?.value !== 'true') return scimError(c, 'SCIM provizyonlama etkin degil.', 403);

  c.set('tenantId', setting.tenantId);
  await next();
});

scimRoutes.get('/ServiceProviderConfig', (c) => c.json({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  filter: { supported: false, maxResults: 0 },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: false },
  authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer Token', primary: true }],
}));

scimRoutes.get('/Users', async (c) => {
  const tenantId = c.get('tenantId');
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, email: true, name: true, isActive: true } },
      roleRef: { select: { id: true, name: true } },
    },
  });
  return c.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: tenantUsers.length,
    startIndex: 1,
    itemsPerPage: tenantUsers.length,
    Resources: tenantUsers.map((tenantUser) => scimUserResource(tenantUser.user, tenantUser)),
  });
});

scimRoutes.get('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId: id },
    include: {
      user: { select: { id: true, email: true, name: true, isActive: true } },
      roleRef: { select: { id: true, name: true } },
    },
  });
  if (!tenantUser) return scimError(c, 'Kullanici bulunamadi.', 404);
  return c.json(scimUserResource(tenantUser.user, tenantUser));
});

scimRoutes.post('/Users', async (c) => {
  const tenantId = c.get('tenantId');
  const body = await readJsonRecord(c);
  if (!body) return scimError(c, 'Gecersiz JSON govdesi.', 400);

  const payload = readUserPayload(body);
  const email = userEmail(payload);
  if (!email) return scimError(c, 'userName veya email zorunludur.', 400);

  const active = payload.active ?? true;
  const normalizedEmail = email.toLowerCase().trim();
  const name = userDisplayName(payload, normalizedEmail);
  const roleId = await resolveScimRoleId(tenantId, payload);

  const resource = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          password: bcrypt.hashSync('axonDefaultSCIM123!', 10),
          isActive: active,
        },
      });
    } else {
      user = await tx.user.update({ where: { id: user.id }, data: { name, isActive: active } });
    }

    await tx.tenantUser.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: { tenantId, userId: user.id, roleId, isActive: active },
      update: { isActive: active, ...(roleId !== null && { roleId }) },
    });
    return tx.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      include: {
        user: { select: { id: true, email: true, name: true, isActive: true } },
        roleRef: { select: { id: true, name: true } },
      },
    });
  });

  if (!resource) return scimError(c, 'Kullanici olusturulamadi.', 500);
  return c.json(scimUserResource(resource.user, resource), 201);
});

scimRoutes.put('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await readJsonRecord(c);
  if (!body) return scimError(c, 'Gecersiz JSON govdesi.', 400);

  const tenantUser = await prisma.tenantUser.findFirst({ where: { tenantId, userId: id } });
  if (!tenantUser) return scimError(c, 'Kullanici bulunamadi.', 404);

  const payload = readUserPayload(body);
  const active = payload.active ?? true;
  const name = userDisplayName(payload, '');
  const roleId = await resolveScimRoleId(tenantId, payload);

  const resource = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { ...(name && { name }), isActive: active } });
    await tx.tenantUser.update({ where: { id: tenantUser.id }, data: { isActive: active, ...(roleId !== null && { roleId }) } });
    return tx.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: id } },
      include: {
        user: { select: { id: true, email: true, name: true, isActive: true } },
        roleRef: { select: { id: true, name: true } },
      },
    });
  });

  if (!resource) return scimError(c, 'Kullanici guncellenemedi.', 500);
  return c.json(scimUserResource(resource.user, resource));
});

scimRoutes.patch('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await readJsonRecord(c);
  if (!body) return scimError(c, 'Gecersiz JSON govdesi.', 400);

  const tenantUser = await prisma.tenantUser.findFirst({ where: { tenantId, userId: id } });
  if (!tenantUser) return scimError(c, 'Kullanici bulunamadi.', 404);

  const payload = roleSyncPatchPayload(readUserPayload(body));
  const data: Prisma.UserUpdateInput = {};
  if (payload.active !== undefined) data.isActive = payload.active;
  const roleId = await resolveScimRoleId(tenantId, payload);

  const resource = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) await tx.user.update({ where: { id }, data });
    await tx.tenantUser.update({
      where: { id: tenantUser.id },
      data: {
        ...(payload.active !== undefined && { isActive: payload.active }),
        ...(roleId !== null && { roleId }),
      },
    });
    return tx.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId: id } },
      include: {
        user: { select: { id: true, email: true, name: true, isActive: true } },
        roleRef: { select: { id: true, name: true } },
      },
    });
  });

  if (!resource) return scimError(c, 'Kullanici guncellenemedi.', 500);
  return c.json(scimUserResource(resource.user, resource));
});

scimRoutes.delete('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const tenantUser = await prisma.tenantUser.findFirst({ where: { tenantId, userId: id } });
  if (!tenantUser) return scimError(c, 'Kullanici bulunamadi.', 404);
  await prisma.tenantUser.update({ where: { id: tenantUser.id }, data: { isActive: false } });
  return c.body(null, 204);
});

scimRoutes.get('/Groups', async (c) => {
  const tenantId = c.get('tenantId');
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: { users: { include: { user: { select: { id: true, email: true, name: true } } } } },
    orderBy: { name: 'asc' },
  });
  return c.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: roles.length,
    startIndex: 1,
    itemsPerPage: roles.length,
    Resources: roles.map((role) => scimGroupResource(role, role.users)),
  });
});

scimRoutes.get('/Groups/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const role = await prisma.role.findFirst({
    where: { tenantId, id },
    include: { users: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  if (!role) return scimError(c, 'SCIM group/rol bulunamadi.', 404);
  return c.json(scimGroupResource(role, role.users));
});

scimRoutes.put('/Groups/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await readJsonRecord(c);
  if (!body) return scimError(c, 'Gecersiz JSON govdesi.', 400);
  const payload = readGroupPayload(body);
  try {
    await updateGroupMembers(tenantId, id, payload.members?.map((member) => member.value).filter((value): value is string => Boolean(value)) ?? []);
  } catch {
    return scimError(c, 'SCIM group/rol bulunamadi.', 404);
  }
  const role = await prisma.role.findFirst({
    where: { tenantId, id },
    include: { users: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  if (!role) return scimError(c, 'SCIM group/rol bulunamadi.', 404);
  return c.json(scimGroupResource(role, role.users));
});

scimRoutes.patch('/Groups/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await readJsonRecord(c);
  if (!body) return scimError(c, 'Gecersiz JSON govdesi.', 400);
  const payload = readGroupPayload(body);
  const role = await prisma.role.findFirst({ where: { tenantId, id }, select: { id: true } });
  if (!role) return scimError(c, 'SCIM group/rol bulunamadi.', 404);

  for (const operation of payload.Operations ?? []) {
    const op = operation.op.toLowerCase();
    const members = isRecord(operation.value) && Array.isArray(operation.value.members)
      ? readMembers(operation.value.members) ?? []
      : Array.isArray(operation.value)
        ? readMembers(operation.value) ?? []
        : [];
    const memberIds = members.map((member) => member.value).filter((value): value is string => Boolean(value));
    if (op === 'add') {
      await prisma.tenantUser.updateMany({ where: { tenantId, userId: { in: memberIds } }, data: { roleId: id } });
    }
    if (op === 'remove') {
      await prisma.tenantUser.updateMany({ where: { tenantId, userId: { in: memberIds }, roleId: id }, data: { roleId: null } });
    }
  }

  const updatedRole = await prisma.role.findFirst({
    where: { tenantId, id },
    include: { users: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  if (!updatedRole) return scimError(c, 'SCIM group/rol bulunamadi.', 404);
  return c.json(scimGroupResource(updatedRole, updatedRole.users));
});

export { scimRoutes };
