import { requireParam } from '../utils/context.js';
import { Context } from 'hono';
import {
  createDemoRequest,
  approveDemoRequest,
  rejectDemoRequest,
} from '../services/demo.service';
import { prisma } from '../lib/prisma';
import { DemoRequestStatus } from '@prisma/client';
import { getPaginationParams } from '../utils/pagination.js';
import { getTrustedClientIp } from '../utils/request-ip.js';

import { rateLimiter } from '../lib/rateLimiter';

export class DemoController {
  private static readonly RATE_LIMIT = 5; // 15 dakikada max 5 talep
  private static readonly RATE_WINDOW = 15 * 60 * 1000; // 15 dakika

  /**
   * POST /public/demo-requests
   * Herkese açık – demo talebi oluşturur.
   */
  static async create(c: Context) {
    // Rate limit kontrolü
    const ip = getTrustedClientIp(c);
    if (await rateLimiter.check(`demo:${ip}`, DemoController.RATE_LIMIT, DemoController.RATE_WINDOW)) {
      return c.json({ success: false, code: 'RATE_LIMITED', message: 'Çok fazla talep gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.' }, 429);
    }

    const body = await c.req.json();

    if (!body.fullName || !body.companyName || !body.email) {
      return c.json({ error: 'fullName, companyName ve email zorunludur.' }, 400);
    }

    // Input uzunluk limitleri
    if (body.fullName.length > 100 || body.companyName.length > 100) {
      return c.json({ error: 'Ad ve şirket adı en fazla 100 karakter olabilir.' }, 400);
    }

    if (body.phone && body.phone.length > 20) {
      return c.json({ error: 'Telefon numarası en fazla 20 karakter olabilir.' }, 400);
    }

    // HTML tag temizleme (XSS koruması — mail template'lerine gidiyor)
    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();

    // Basit email validasyonu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return c.json({ error: 'Geçerli bir e-posta adresi giriniz.' }, 400);
    }

    // Plan validasyonu
    const validPlans = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    if (body.plan && !validPlans.includes(body.plan)) {
      return c.json({ error: 'Geçersiz plan. STARTER, PROFESSIONAL veya ENTERPRISE olmalıdır.' }, 400);
    }

    const result = await createDemoRequest({
      fullName: stripHtml(body.fullName),
      companyName: stripHtml(body.companyName),
      email: body.email,
      phone: body.phone ? stripHtml(body.phone) : undefined,
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
    const { page, limit, skip } = getPaginationParams(c, 20);

    const where = status ? { status: status as DemoRequestStatus } : {};

    const [data, total] = await Promise.all([
      prisma.demoRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skip,
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
    const id = requireParam(c, 'id');
    const adminId = (c.get('userId') as string) || 'admin';

    const result = await approveDemoRequest(id, adminId);
    return c.json(result, result.success ? 200 : 400);
  }

  /**
   * POST /api/admin/demo-requests/:id/reject
   * Admin – demo talebini reddet.
   */
  static async reject(c: Context) {
    const id = requireParam(c, 'id');
    const body = await c.req.json().catch(() => ({}));
    const adminId = (c.get('userId') as string) || 'admin';

    const result = await rejectDemoRequest(id, adminId, body.reason);
    return c.json(result);
  }
}
