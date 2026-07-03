import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

const scimRoutes = new Hono<{ Variables: { tenantId: string } }>();

// Multitenant SCIM Bearer token validation middleware
scimRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Yetkisiz erişim. SCIM Bearer token eksik.',
      status: '401',
    }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Geçersiz token.',
      status: '401',
    }, 401);
  }

  const setting = await prisma.tenantSetting.findFirst({
    where: { key: 'security.scim.token', value: token },
    select: { tenantId: true },
  });

  if (!setting) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Yetkisiz SCIM token.',
      status: '401',
    }, 401);
  }

  // Verify Enterprise Plan status
  const tenant = await prisma.tenant.findUnique({
    where: { id: setting.tenantId },
    select: { plan: true },
  });

  if (tenant?.plan !== 'ENTERPRISE') {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'SCIM provizyonlama özelliği sadece Enterprise plan müşterileri içindir.',
      status: '403',
    }, 403);
  }

  const enabledSetting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: setting.tenantId, key: 'security.scim.enabled' } },
  });

  if (enabledSetting?.value !== 'true') {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'SCIM provizyonlama özelliği bu işletme için etkinleştirilmemiş.',
      status: '403',
    }, 403);
  }

  c.set('tenantId', setting.tenantId);
  await next();
});

// GET /Users - List Users (SCIM standard)
scimRoutes.get('/Users', async (c) => {
  const tenantId = c.get('tenantId') as string;

  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  const users = tenantUsers.map((tu) => tu.user);

  return c.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: users.length,
    startIndex: 1,
    itemsPerPage: users.length,
    Resources: users.map((u) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: u.id,
      userName: u.email,
      name: {
        formatted: u.name,
        familyName: u.name.split(' ').pop() || '',
        givenName: u.name.split(' ').slice(0, -1).join(' ') || u.name,
      },
      emails: [{ value: u.email, primary: true }],
      active: u.isActive,
    })),
  });
});

// GET /Users/:id - Get User Details
scimRoutes.get('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id');

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId: id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!tenantUser) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Kullanıcı bulunamadı.',
      status: '404',
    }, 404);
  }

  const u = tenantUser.user;
  return c.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    userName: u.email,
    name: {
      formatted: u.name,
      familyName: u.name.split(' ').pop() || '',
      givenName: u.name.split(' ').slice(0, -1).join(' ') || u.name,
    },
    emails: [{ value: u.email, primary: true }],
    active: u.isActive,
  });
});

// POST /Users - Provision User
scimRoutes.post('/Users', async (c) => {
  const tenantId = c.get('tenantId') as string;

  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Geçersiz JSON gövdesi.',
      status: '400',
    }, 400);
  }

  const email = body.userName || body.emails?.[0]?.value;
  const name = body.name?.formatted || `${body.name?.givenName || ''} ${body.name?.familyName || ''}`.trim() || email;
  const active = typeof body.active === 'boolean' ? body.active : true;

  if (!email) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'userName veya email alanı zorunludur.',
      status: '400',
    }, 400);
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    const hashedPassword = bcrypt.hashSync('axonDefaultSCIM123!', 10);
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name,
        password: hashedPassword,
        isActive: active,
      },
    });
  } else {
    // If user already exists, update activity flag if needed
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: active },
    });
  }

  // Associate user with tenant
  let tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
  });

  if (!tenantUser) {
    tenantUser = await prisma.tenantUser.create({
      data: {
        tenantId,
        userId: user.id,
        isActive: active,
      },
    });
  } else {
    await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: { isActive: active },
    });
  }

  return c.json({
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
  }, 201);
});

// PUT /Users/:id - Replace User fields
scimRoutes.put('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id');

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId: id },
  });

  if (!tenantUser) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Kullanıcı bulunamadı.',
      status: '404',
    }, 404);
  }

  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Geçersiz JSON gövdesi.',
      status: '400',
    }, 400);
  }

  const name = body.name?.formatted || `${body.name?.givenName || ''} ${body.name?.familyName || ''}`.trim();
  const active = typeof body.active === 'boolean' ? body.active : true;

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(name && { name }),
      isActive: active,
    },
  });

  await prisma.tenantUser.update({
    where: { id: tenantUser.id },
    data: { isActive: active },
  });

  return c.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: updatedUser.id,
    userName: updatedUser.email,
    name: {
      formatted: updatedUser.name,
      familyName: updatedUser.name.split(' ').pop() || '',
      givenName: updatedUser.name.split(' ').slice(0, -1).join(' ') || updatedUser.name,
    },
    emails: [{ value: updatedUser.email, primary: true }],
    active: updatedUser.isActive,
  });
});

// PATCH /Users/:id - Patch User fields (commonly active status)
scimRoutes.patch('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id');

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId: id },
  });

  if (!tenantUser) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Kullanıcı bulunamadı.',
      status: '404',
    }, 404);
  }

  let body: Record<string, any>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Geçersiz JSON gövdesi.',
      status: '400',
    }, 400);
  }

  // SCIM patch format often uses operations array: {"Operations": [{"op": "replace", "value": {"active": false}}]}
  let active = true;
  let hasActiveChange = false;

  const operations = body.Operations;
  if (Array.isArray(operations)) {
    for (const op of operations) {
      if (op.op?.toLowerCase() === 'replace') {
        if (typeof op.value?.active === 'boolean') {
          active = op.value.active;
          hasActiveChange = true;
        } else if (typeof op.value === 'object' && typeof op.value.active === 'boolean') {
          active = op.value.active;
          hasActiveChange = true;
        }
      }
    }
  }

  if (hasActiveChange) {
    await prisma.user.update({
      where: { id },
      data: { isActive: active },
    });

    await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: { isActive: active },
    });
  }

  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, isActive: true },
  });

  if (!u) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Kullanıcı güncellenirken hata oluştu.',
      status: '500',
    }, 500);
  }

  return c.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    userName: u.email,
    name: {
      formatted: u.name,
      familyName: u.name.split(' ').pop() || '',
      givenName: u.name.split(' ').slice(0, -1).join(' ') || u.name,
    },
    emails: [{ value: u.email, primary: true }],
    active: u.isActive,
  });
});

// DELETE /Users/:id - Deprovision User
scimRoutes.delete('/Users/:id', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const id = c.req.param('id');

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId: id },
  });

  if (!tenantUser) {
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Kullanıcı bulunamadı.',
      status: '404',
    }, 404);
  }

  // SCIM standard often deletes the user or deactivates.
  // We will deactivate the user's membership and remove the association.
  await prisma.tenantUser.delete({
    where: { id: tenantUser.id },
  });

  return c.body(null, 204);
});

export { scimRoutes };
