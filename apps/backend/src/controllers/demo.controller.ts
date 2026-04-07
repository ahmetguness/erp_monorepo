import { Context } from 'hono';
import {
  createDemoRequest,
  approveDemoRequest,
  rejectDemoRequest,
} from '../services/demo.service';
import { prisma } from '../lib/prisma';

export class DemoController {
  /**
   * POST /public/demo-requests
   * Herkese açık – demo talebi oluşturur.
   */
  static async create(c: Context) {
    const body = await c.req.json();
    console.log('📩 DEMO REQUEST RAW BODY:', JSON.stringify(body, null, 2));

    if (!body.fullName || !body.companyName || !body.email) {
      return c.json({ error: 'fullName, companyName ve email zorunludur.' }, 400);
    }

    // Basit email validasyonu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return c.json({ error: 'Geçerli bir e-posta adresi giriniz.' }, 400);
    }

    const result = await createDemoRequest({
      fullName: body.fullName,
      companyName: body.companyName,
      email: body.email,
      phone: body.phone,
      plan: body.plan,
    });

    if (!result.success && 'code' in result) {
      return c.json(result, 409);
    }

    const status = result.success ? 201 : 500;
    return c.json(result, status);
  }

  /**
   * GET /api/admin/demo-requests
   * Admin – tüm demo taleplerini listeler.
   */
  static async list(c: Context) {
    const status = c.req.query('status');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    const where = status ? { status: status as any } : {};

    const [data, total] = await Promise.all([
      prisma.demoRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.demoRequest.count({ where }),
    ]);

    return c.json({ data, total, page, limit });
  }

  /**
   * GET /api/admin/demo-requests/:id
   * Admin – tek demo talebi detayı.
   */
  static async getById(c: Context) {
    const id = c.req.param('id');
    const demoRequest = await prisma.demoRequest.findUnique({ where: { id } });

    if (!demoRequest) {
      return c.json({ error: 'Demo talebi bulunamadı.' }, 404);
    }

    return c.json({ data: demoRequest });
  }

  /**
   * POST /api/admin/demo-requests/:id/approve
   * Admin – Enterprise demo talebini onayla ve provision et.
   */
  static async approve(c: Context) {
    const id = c.req.param('id');
    const adminId = (c as any).get?.('userId') || 'admin';

    const result = await approveDemoRequest(id, adminId);
    return c.json(result, result.success ? 200 : 400);
  }

  /**
   * POST /api/admin/demo-requests/:id/reject
   * Admin – demo talebini reddet.
   */
  static async reject(c: Context) {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const adminId = (c as any).get?.('userId') || 'admin';

    const result = await rejectDemoRequest(id, adminId, body.reason);
    return c.json(result);
  }
}
