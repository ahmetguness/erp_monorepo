import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendMail } from './mail.service';
import { demoReadyEmail, demoEnterpriseNotifyEmail } from './mail-templates.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ── Tipler ───────────────────────────────────

interface CreateDemoRequestDTO {
  fullName: string;
  companyName: string;
  email: string;
  phone?: string;
  plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
}

interface DemoProvisionResult {
  success: boolean;
  demoRequestId: string;
  tenantSlug?: string;
  error?: string;
}

// ── Conflict response tipi ───────────────────

interface ConflictResult {
  success: false;
  code: string;
  message: string;
  details: { email: string };
}

// ── Spam / Duplicate / Mevcut hesap kontrol ──

async function checkConflicts(email: string): Promise<ConflictResult | null> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Mevcut kayıtlı kullanıcı var mı? (tüm tenant'lar)
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      tenants: {
        where: { isActive: true },
        include: {
          tenant: { select: { status: true } },
        },
      },
    },
  });

  if (existingUser && existingUser.tenants.length > 0) {
    const hasActiveTenant = existingUser.tenants.some(
      (tu) => tu.tenant.status === 'ACTIVE' || tu.tenant.status === 'TRIAL'
    );
    if (hasActiveTenant) {
      return {
        success: false,
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: 'Bu e-posta adresi ile zaten aktif bir hesap bulunmaktadır. Giriş yapmayı deneyin.',
        details: { email: normalizedEmail },
      };
    }
  }

  // 2. Aktif (PROVISIONED) demo var mı?
  const activeDemo = await prisma.demoRequest.findFirst({
    where: {
      email: normalizedEmail,
      status: 'PROVISIONED',
    },
  });

  if (activeDemo) {
    return {
      success: false,
      code: 'DEMO_ALREADY_ACTIVE',
      message: 'Bu e-posta adresi için aktif bir demo hesabı zaten mevcut.',
      details: { email: normalizedEmail },
    };
  }

  // 3. Bekleyen (PENDING / APPROVED / PROVISIONING) talep var mı?
  const pendingRequest = await prisma.demoRequest.findFirst({
    where: {
      email: normalizedEmail,
      status: { in: ['PENDING', 'APPROVED', 'PROVISIONING'] },
    },
  });

  if (pendingRequest) {
    return {
      success: false,
      code: 'DEMO_REQUEST_PENDING',
      message: 'Bu e-posta adresi için bekleyen bir demo talebi zaten bulunuyor.',
      details: { email: normalizedEmail },
    };
  }

  // 4. Son 24 saatte oluşturulmuş talep var mı? (spam koruması)
  const recentRequest = await prisma.demoRequest.findFirst({
    where: {
      email: normalizedEmail,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentRequest) {
    return {
      success: false,
      code: 'DEMO_RATE_LIMITED',
      message: 'Bu e-posta adresi ile son 24 saat içinde zaten bir demo talebi oluşturulmuş. Lütfen daha sonra tekrar deneyin.',
      details: { email: normalizedEmail },
    };
  }

  return null;
}

// ── Demo talebi oluştur ──────────────────────

export async function createDemoRequest(dto: CreateDemoRequestDTO) {
  const email = dto.email.toLowerCase().trim();

  // Conflict kontrol
  const conflict = await checkConflicts(email);
  if (conflict) {
    return conflict;
  }

  const plan = dto.plan || 'STARTER';

  const demoRequest = await prisma.demoRequest.create({
    data: {
      fullName: dto.fullName,
      companyName: dto.companyName,
      email,
      phone: dto.phone,
      plan,
      status: plan === 'ENTERPRISE' ? 'PENDING' : 'APPROVED',
    },
  });

  logger.info(`Demo talebi oluşturuldu: ${demoRequest.id} (${plan})`);

  // Enterprise → sales ekibine bildirim, manuel onay bekler
  if (plan === 'ENTERPRISE') {
    const salesEmail = process.env.SALES_NOTIFICATION_EMAIL;
    if (salesEmail) {
      const template = demoEnterpriseNotifyEmail(dto.fullName, dto.companyName, email);
      await sendMail({ to: salesEmail, ...template });
    }
    return {
      success: true,
      demoRequestId: demoRequest.id,
      requiresApproval: true,
      message: 'Enterprise demo talebi alındı. Satış ekibimiz en kısa sürede sizinle iletişime geçecektir.',
    };
  }

  // Starter / Professional → otomatik provisioning
  const result = await provisionDemoTenant(demoRequest.id);
  return result;
}

// ── Demo tenant provisioning ─────────────────

export async function provisionDemoTenant(demoRequestId: string): Promise<DemoProvisionResult> {
  const demoRequest = await prisma.demoRequest.findUnique({
    where: { id: demoRequestId },
  });

  if (!demoRequest) {
    return { success: false, demoRequestId, error: 'Demo talebi bulunamadı.' };
  }

  if (demoRequest.status !== 'APPROVED' && demoRequest.status !== 'PENDING') {
    return { success: false, demoRequestId, error: `Geçersiz durum: ${demoRequest.status}` };
  }

  // Status → PROVISIONING
  await prisma.demoRequest.update({
    where: { id: demoRequestId },
    data: { status: 'PROVISIONING' },
  });

  try {
    // Slug oluştur
    const baseSlug = `demo-${demoRequest.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)}`;

    const existing = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    // Set-password token oluştur
    const setPasswordToken = crypto.randomBytes(32).toString('hex');
    const setPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    // Trial süresi: 15 gün
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    // Geçici şifre (kullanıcı set-password ile değiştirecek)
    const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);

    // Transaction: tenant + user + tenantUser + demo seed
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tenant oluştur
      const tenant = await tx.tenant.create({
        data: {
          slug,
          companyName: demoRequest.companyName,
          email: demoRequest.email,
          phone: demoRequest.phone,
          plan: demoRequest.plan,
          status: 'TRIAL',
          trialEndsAt,
          modules: getModulesForPlan(demoRequest.plan),
        },
      });

      // 2. User oluştur (veya mevcut user'ı bul)
      let user = await tx.user.findUnique({
        where: { email: demoRequest.email },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: demoRequest.email,
            name: demoRequest.fullName,
            phone: demoRequest.phone,
            password: tempPassword,
            passwordResetToken: setPasswordToken,
            passwordResetExpiry: setPasswordExpiry,
          },
        });
      } else {
        // Mevcut user'a token ekle
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: setPasswordToken,
            passwordResetExpiry: setPasswordExpiry,
          },
        });
      }

      // 3. TenantUser bağla
      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          isOwner: true,
          isActive: true,
        },
      });

      // 4. Demo seed verileri
      await seedDemoData(tx, tenant.id);

      return { tenant, user };
    });

    // DemoRequest güncelle → PROVISIONED
    await prisma.demoRequest.update({
      where: { id: demoRequestId },
      data: {
        status: 'PROVISIONED',
        tenantId: result.tenant.id,
        setPasswordToken,
        setPasswordExpiry,
        processedAt: new Date(),
      },
    });

    // Mail gönder
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const setPasswordUrl = `${appUrl}/set-password?token=${setPasswordToken}&email=${encodeURIComponent(demoRequest.email)}`;

    const template = demoReadyEmail(
      demoRequest.fullName,
      demoRequest.plan,
      setPasswordUrl,
      trialEndsAt,
    );
    await sendMail({ to: demoRequest.email, ...template });

    logger.info(`Demo tenant oluşturuldu: ${slug} (request: ${demoRequestId})`);

    return {
      success: true,
      demoRequestId,
      tenantSlug: slug,
    };
  } catch (err: any) {
    logger.error('Demo provisioning hatası:', err);

    // Rollback status
    await prisma.demoRequest.update({
      where: { id: demoRequestId },
      data: { status: 'APPROVED' },
    });

    return { success: false, demoRequestId, error: err.message };
  }
}

// ── Enterprise onay ──────────────────────────

export async function approveDemoRequest(demoRequestId: string, approvedBy: string) {
  const demoRequest = await prisma.demoRequest.update({
    where: { id: demoRequestId },
    data: { status: 'APPROVED', processedBy: approvedBy },
  });

  // Onay sonrası otomatik provisioning
  return provisionDemoTenant(demoRequest.id);
}

export async function rejectDemoRequest(demoRequestId: string, rejectedBy: string, reason?: string) {
  await prisma.demoRequest.update({
    where: { id: demoRequestId },
    data: {
      status: 'REJECTED',
      processedBy: rejectedBy,
      rejectedReason: reason,
      processedAt: new Date(),
    },
  });

  return { success: true };
}

// ── Plan'a göre modüller ─────────────────────

function getModulesForPlan(plan: string): string[] {
  switch (plan) {
    case 'STARTER':
      return ['ACCOUNTING', 'INVENTORY'];
    case 'PROFESSIONAL':
      return ['ACCOUNTING', 'INVENTORY', 'CRM', 'SALES', 'PURCHASING', 'WAREHOUSE'];
    case 'ENTERPRISE':
      return ['ACCOUNTING', 'INVENTORY', 'CRM', 'SALES', 'PURCHASING', 'WAREHOUSE', 'PRODUCTION', 'SERVICE', 'HR', 'PAYROLL', 'MARKETPLACE', 'REPORTING'];
    default:
      return ['ACCOUNTING', 'INVENTORY'];
  }
}

// ── Demo seed verileri ───────────────────────

async function seedDemoData(tx: any, tenantId: string) {
  // Temel birimler
  const adet = await tx.unit.create({ data: { tenantId, name: 'Adet', code: 'AD' } });
  const kg = await tx.unit.create({ data: { tenantId, name: 'Kilogram', code: 'KG' } });

  // Kategoriler
  const cat1 = await tx.category.create({ data: { tenantId, name: 'Genel Ürünler' } });

  // Vergi oranları
  const kdv18 = await tx.taxRate.create({ data: { tenantId, name: 'KDV %18', rate: 18 } });
  const kdv10 = await tx.taxRate.create({ data: { tenantId, name: 'KDV %10', rate: 10 } });

  // Para birimi
  await tx.currency.create({ data: { tenantId, code: 'TRY', name: 'Türk Lirası', symbol: '₺', defaultRate: 1, isBase: true } });
  await tx.currency.create({ data: { tenantId, code: 'USD', name: 'ABD Doları', symbol: '$', defaultRate: 38.5 } });
  await tx.currency.create({ data: { tenantId, code: 'EUR', name: 'Euro', symbol: '€', defaultRate: 42.1 } });

  // Depo
  const warehouse = await tx.warehouse.create({
    data: { tenantId, name: 'Ana Depo', code: 'WH-01', isActive: true },
  });

  // Örnek ürünler
  await tx.product.create({
    data: { tenantId, code: 'PRD-001', name: 'Demo Ürün A', unitId: adet.id, categoryId: cat1.id, taxRateId: kdv18.id, salesPrice: 150, purchasePrice: 100 },
  });
  await tx.product.create({
    data: { tenantId, code: 'PRD-002', name: 'Demo Ürün B', unitId: kg.id, categoryId: cat1.id, taxRateId: kdv10.id, salesPrice: 75, purchasePrice: 50 },
  });

  // Örnek müşteri ve tedarikçi
  await tx.contact.create({
    data: { tenantId, type: 'CUSTOMER', name: 'Demo Müşteri A.Ş.', code: 'C-001', email: 'demo@musteri.com', city: 'İstanbul' },
  });
  await tx.contact.create({
    data: { tenantId, type: 'SUPPLIER', name: 'Demo Tedarikçi Ltd.', code: 'S-001', email: 'demo@tedarikci.com', city: 'Ankara' },
  });

  // Numara serileri
  const modules = ['INVOICE', 'SALES_ORDER', 'PURCHASE_ORDER', 'STOCK_MOVEMENT', 'DELIVERY_NOTE'];
  for (const mod of modules) {
    await tx.numberSequence.create({
      data: { tenantId, module: mod, prefix: mod.slice(0, 3) + '-', lastNum: 0, padding: 6 },
    });
  }
}
