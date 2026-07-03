import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { calculateSla } from '../controllers/service-request.controller';
import { generateDocumentNumber } from '../utils/generate-number.js';
import { getPaginationParams } from '../utils/pagination.js';
import { ServiceStatus, Priority, ServiceActivityType } from '@prisma/client';

const portalRoutes = new Hono<{
  Variables: {
    tenantId: string;
    contactId: string;
  };
}>();

// Auth Middleware for Portal
portalRoutes.use('*', async (c, next) => {
  const contactId = c.req.header('X-Contact-Id');
  const token = c.req.header('X-Portal-Token');

  if (!contactId || !token) {
    return c.json({ error: 'X-Contact-Id ve X-Portal-Token başlıkları zorunludur.' }, 401);
  }

  // 1. Find the Contact
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, isActive: true, deletedAt: null },
    select: { tenantId: true },
  });
  if (!contact) {
    return c.json({ error: 'Geçersiz müşteri kimliği veya pasif cari.' }, 401);
  }

  // 2. Validate Plan (Enterprise only)
  const tenant = await prisma.tenant.findUnique({
    where: { id: contact.tenantId },
    select: { plan: true },
  });
  if (!tenant || tenant.plan !== 'ENTERPRISE') {
    return c.json({ error: 'Müşteri portalı sadece ENTERPRISE planı kapsamındadır.' }, 403);
  }

  // 3. Find and verify the setting
  const expectedTokenSetting = await prisma.tenantSetting.findFirst({
    where: {
      tenantId: contact.tenantId,
      key: `portal.token.${contactId}`,
    },
    select: { value: true },
  });

  if (!expectedTokenSetting || expectedTokenSetting.value !== token) {
    return c.json({ error: 'Müşteri portal bağlantı anahtarı (token) geçersiz.' }, 401);
  }

  c.set('tenantId', contact.tenantId);
  c.set('contactId', contactId);
  await next();
});

// GET /requests - List customer's requests
portalRoutes.get('/requests', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const contactId = c.get('contactId') as string;
  const { page, limit, skip } = getPaginationParams(c, 20);

  const where = {
    tenantId,
    contactId,
    deletedAt: null,
  };

  const [total, data] = await prisma.$transaction([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      include: {
        customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true } },
        _count: { select: { activities: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const dataWithSla = data.map((row) => ({
    ...row,
    sla: calculateSla(row.createdAt, row.priority, row.status, row.closedAt),
  }));

  return c.json({ data: dataWithSla, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
});

// GET /requests/:id - Get details of a request
portalRoutes.get('/requests/:id', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const contactId = c.get('contactId') as string;
  const id = c.req.param('id');

  const sr = await prisma.serviceRequest.findFirst({
    where: { id, tenantId, contactId, deletedAt: null },
    include: {
      customerAsset: { select: { id: true, name: true, brand: true, model: true, serialNo: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      history: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!sr) {
    return c.json({ error: 'Kayıt bulunamadı.' }, 404);
  }

  const srWithSla = {
    ...sr,
    sla: calculateSla(sr.createdAt, sr.priority, sr.status, sr.closedAt),
  };

  return c.json({ data: srWithSla });
});

// POST /requests - Create request as a customer
portalRoutes.post('/requests', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const contactId = c.get('contactId') as string;
  const body = await c.req.json<{
    subject: string;
    description?: string;
    priority?: Priority;
    customerAssetId?: string;
  }>();

  if (!body.subject) {
    return c.json({ error: 'Konu (subject) alanı zorunludur.' }, 400);
  }

  const number = await generateDocumentNumber(tenantId, 'service_request', 'SR-', 'serviceRequest');

  let warrantyEnd: Date | null = null;
  if (body.customerAssetId) {
    const asset = await prisma.customerAsset.findFirst({
      where: { id: body.customerAssetId, tenantId, contactId },
      select: { warrantyEnd: true },
    });
    warrantyEnd = asset?.warrantyEnd ?? null;
  }

  const sr = await prisma.serviceRequest.create({
    data: {
      tenantId,
      contactId,
      customerAssetId: body.customerAssetId ?? null,
      number,
      subject: body.subject,
      description: body.description ?? null,
      priority: body.priority ?? 'MEDIUM',
      warrantyEnd,
      history: { create: { tenantId, toStatus: 'OPEN' } },
    },
  });

  return c.json({ data: sr }, 201);
});

// POST /requests/:id/comments - Add customer comment to a request
portalRoutes.post('/requests/:id/comments', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const contactId = c.get('contactId') as string;
  const id = c.req.param('id');
  const body = await c.req.json<{ notes: string }>();

  if (!body.notes) {
    return c.json({ error: 'Yorum metni (notes) zorunludur.' }, 400);
  }

  const sr = await prisma.serviceRequest.findFirst({
    where: { id, tenantId, contactId, deletedAt: null },
    select: { id: true },
  });
  if (!sr) {
    return c.json({ error: 'Kayıt bulunamadı.' }, 404);
  }

  const comment = await prisma.serviceActivity.create({
    data: {
      tenantId,
      serviceRequestId: id,
      activityType: ServiceActivityType.NOTE,
      notes: `Müşteri Yorumu: ${body.notes}`,
    },
  });

  return c.json({ data: comment }, 201);
});

export { portalRoutes };
