import {
  ApprovalActionType,
  ApprovalModule,
  ApprovalStatus,
  AuditAction,
  AutomationAction,
  AutomationExecutionStatus,
  AutomationTrigger,
  DemoRequestStatus,
  DomainEventOutboxStatus,
  EDocumentStatus,
  EDocumentType,
  EntityType,
  FeatureKey,
  FeatureType,
  MailDeliveryStatus,
  MailDirection,
  MarketplaceChannel,
  MarketplaceOrderStatus,
  Plan,
  PlatformTicketCategory,
  PlatformTicketPriority,
  PlatformTicketSender,
  PlatformTicketStatus,
  Priority,
  PrismaClient,
  RecordCollaborationEntryType,
  SavedViewScope,
  SyncJobStatus,
  SyncJobType,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import { PLAN_FEATURE_ROWS, type PlanFeatureRow } from '@repo/types/plans';
import bcrypt from 'bcryptjs';
import { modulesForPlan } from '../src/utils/tenant-modules';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function d(dateStr: string): Date {
  return new Date(dateStr);
}

async function hash(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

// ─────────────────────────────────────────────
// PLAN FEATURES
// ─────────────────────────────────────────────

async function seedPlanFeatures() {
  const features = PLAN_FEATURE_ROWS.map(toPrismaPlanFeature);

  for (const f of features) {
    await prisma.planFeature.upsert({
      where: { plan_key: { plan: f.plan, key: f.key } },
      create: f,
      update: { value: f.value, type: f.type, isEnabled: f.isEnabled, featureKey: f.featureKey },
    });
  }
}

function toPrismaPlanFeature(feature: PlanFeatureRow) {
  const value = feature.value;
  return {
    plan: Plan[feature.plan],
    key: feature.key,
    featureKey: FeatureKey[feature.featureKey],
    value,
    type: FeatureType[feature.type],
    isEnabled: value !== 'false',
  };
}

type DemoPlan = 'STARTER' | 'PROFESSIONAL';

async function seedPlanDemoAccount(input: {
  slug: string;
  companyName: string;
  taxNumber: string;
  taxOffice: string;
  email: string;
  ownerName: string;
  phone: string;
  sector: string;
  plan: DemoPlan;
  password: string;
}) {
  const tenant = await prisma.tenant.create({
    data: {
      slug: input.slug,
      companyName: input.companyName,
      taxNumber: input.taxNumber,
      taxOffice: input.taxOffice,
      email: `info@${input.slug}.com`,
      phone: input.phone,
      address: 'Demo Mahallesi No:1',
      city: 'İstanbul',
      country: 'TR',
      sector: input.sector,
      plan: input.plan,
      status: 'ACTIVE',
      modules: modulesForPlan(input.plan),
      subscriptionStart: d('2026-01-01'),
      subscriptionEnd: d('2026-12-31'),
    },
  });

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.ownerName,
      phone: input.phone,
      password: input.password,
      isActive: true,
    },
  });

  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: user.id, isOwner: true, isActive: true },
  });

  return { tenant, user };
}

// ─────────────────────────────────────────────
// PLATFORM CLEANUP (Idempotent seed reset)
// ─────────────────────────────────────────────

async function cleanupPlatformRecords() {
  // Platform incidents & communications
  await prisma.platformIncidentCommunication.deleteMany({});
  await prisma.platformIncidentTimeline.deleteMany({});
  await prisma.platformIncidentTenant.deleteMany({});
  await prisma.platformIncident.deleteMany({});

  // Security findings
  await prisma.platformSecurityFinding.deleteMany({});

  // Disaster recovery
  await prisma.platformRestoreDrill.deleteMany({});
  await prisma.platformBackupEvidence.deleteMany({});
  await prisma.platformDisasterRecoveryPolicy.deleteMany({});

  // Demo requests
  await prisma.demoRequestHistory.deleteMany({});
  await prisma.demoRequest.deleteMany({});

  // Feature rollouts
  await prisma.featureRollout.deleteMany({});

  // Billing coupons & discounts
  await prisma.subscriptionDiscount.deleteMany({});
  await prisma.billingCoupon.deleteMany({});

  // Observability
  await prisma.observabilityAlertHistory.deleteMany({});
  await prisma.observabilityMetricPoint.deleteMany({});
  await prisma.observabilitySlo.deleteMany({});
  await prisma.observabilityLogEntry.deleteMany({});
  await prisma.deploymentMarker.deleteMany({});

  // Platform audit policy
  await prisma.platformAuditPolicy.deleteMany({});
  await prisma.platformAuditPolicy.create({
    data: { id: 'default', retentionDays: 2555 },
  });

  // Privacy
  await prisma.privacyDownloadGrant.deleteMany({});
  await prisma.privacyLegalHold.deleteMany({});
  await prisma.dataSubjectRequest.deleteMany({});

  // Admin extensions
  await prisma.adminIdempotencyRecord.deleteMany({});
  await prisma.adminSensitiveAccessGrant.deleteMany({});
  await prisma.adminSavedListView.deleteMany({});
  await prisma.adminInboxTaskState.deleteMany({});
  await prisma.adminInboxItemState.deleteMany({});
  await prisma.adminInboxPreference.deleteMany({});
  await prisma.adminUiPreference.deleteMany({});
  await prisma.adminChangeRequest.deleteMany({});
}

// ─────────────────────────────────────────────
// TENANT & USERS
// ─────────────────────────────────────────────

async function seedTenant() {
  // 1. Önce TÜM kiracıları temizle (eski dataları sil, sadece yeni seed kalsın)
  await prisma.tenant.deleteMany({});

  // 2. Platform seviyesindeki bağımsız kayıtları temizle
  await cleanupPlatformRecords();

  // 3. Platform admini haricindeki tüm kullanıcıları temizle
  await prisma.user.deleteMany({});
  await prisma.adminUser.deleteMany({
    where: { email: { not: 'admin@axonerp.com' } },
  });

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'axon-demo',
      companyName: 'Axon Demo Teknoloji A.Ş.',
      taxNumber: '1234567890',
      taxOffice: 'Kadıköy',
      email: 'info@axondemo.com',
      phone: '+90 212 555 0100',
      address: 'Bağdat Caddesi No:42 Daire:5',
      city: 'İstanbul',
      country: 'TR',
      sector: 'Teknoloji',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      modules: modulesForPlan('ENTERPRISE'),
      subscriptionStart: d('2026-01-01'),
      subscriptionEnd: d('2026-12-31'),
    },
  });

  const pw = await hash('demo1234');

  const userAdmin = await prisma.user.create({
    data: {
      email: 'admin@axondemo.com',
      name: 'Ahmet Yılmaz',
      phone: '+90 532 555 0101',
      password: pw,
      isActive: true,
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: userAdmin.id, isOwner: true, isActive: true },
  });

  const userSales = await prisma.user.create({
    data: {
      email: 'satis@axondemo.com',
      name: 'Zeynep Kaya',
      phone: '+90 532 555 0102',
      password: pw,
      isActive: true,
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: userSales.id, isOwner: false, isActive: true },
  });

  const userAccounting = await prisma.user.create({
    data: {
      email: 'muhasebe@axondemo.com',
      name: 'Mehmet Demir',
      phone: '+90 532 555 0103',
      password: pw,
      isActive: true,
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: userAccounting.id, isOwner: false, isActive: true },
  });

  const userWarehouse = await prisma.user.create({
    data: {
      email: 'depo@axondemo.com',
      name: 'Ali Çelik',
      phone: '+90 532 555 0104',
      password: pw,
      isActive: true,
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: userWarehouse.id, isOwner: false, isActive: true },
  });

  const starterAccount = await seedPlanDemoAccount({
    slug: 'axon-starter-demo',
    companyName: 'Axon Starter Demo Ltd. Şti.',
    taxNumber: '1234567891',
    taxOffice: 'Kadıköy',
    email: 'starter@axondemo.com',
    ownerName: 'Starter Demo',
    phone: '+90 532 555 0111',
    sector: 'Perakende',
    plan: 'STARTER',
    password: pw,
  });

  const professionalAccount = await seedPlanDemoAccount({
    slug: 'axon-pro-demo',
    companyName: 'Axon Pro Demo Ltd. Şti.',
    taxNumber: '1234567892',
    taxOffice: 'Şişli',
    email: 'pro@axondemo.com',
    ownerName: 'Pro Demo',
    phone: '+90 532 555 0121',
    sector: 'Toptan Ticaret',
    plan: 'PROFESSIONAL',
    password: pw,
  });

  return {
    tenant,
    users: [userAdmin, userSales, userAccounting, userWarehouse],
    planAccounts: [starterAccount, professionalAccount],
  };
}

// ─────────────────────────────────────────────
// MASTER DATA (Units, Categories, Taxes, Currencies, TDHP, Sequences)
// ─────────────────────────────────────────────

async function seedMasterData(tenantId: string) {
  // Units
  const [unitAdet, unitKg, unitLt, unitMt, unitKutu, unitPaket] = await Promise.all([
    prisma.unit.create({ data: { tenantId, name: 'Adet', code: 'AD' } }),
    prisma.unit.create({ data: { tenantId, name: 'Kilogram', code: 'KG' } }),
    prisma.unit.create({ data: { tenantId, name: 'Litre', code: 'LT' } }),
    prisma.unit.create({ data: { tenantId, name: 'Metre', code: 'MT' } }),
    prisma.unit.create({ data: { tenantId, name: 'Kutu', code: 'KT' } }),
    prisma.unit.create({ data: { tenantId, name: 'Paket', code: 'PK' } }),
  ]);

  // Categories
  const catElektronik = await prisma.category.create({ data: { tenantId, name: 'Elektronik' } });
  const catBilgisayar = await prisma.category.create({ data: { tenantId, name: 'Bilgisayar', parentId: catElektronik.id } });
  const catTelefon = await prisma.category.create({ data: { tenantId, name: 'Telefon', parentId: catElektronik.id } });
  const catAksesuar = await prisma.category.create({ data: { tenantId, name: 'Aksesuar', parentId: catElektronik.id } });
  const catOfis = await prisma.category.create({ data: { tenantId, name: 'Ofis Malzemeleri' } });
  const catHammadde = await prisma.category.create({ data: { tenantId, name: 'Hammadde' } });
  const catYarimMamul = await prisma.category.create({ data: { tenantId, name: 'Yarı Mamul' } });

  // Tax Rates (Standart ve Tevkifatlı)
  const [kdv0, kdv10, kdv20, tevkifat510, tevkifat710] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %0', rate: 0, isWithholding: false } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %10', rate: 10, isWithholding: false } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %20', rate: 20, isWithholding: false } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV Tevkifatı (5/10)', rate: 10, isWithholding: true } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV Tevkifatı (7/10)', rate: 14, isWithholding: true } }),
  ]);

  // Currencies
  await Promise.all([
    prisma.currency.create({ data: { tenantId, code: 'TRY', name: 'Türk Lirası', symbol: '₺', defaultRate: 1, isBase: true } }),
    prisma.currency.create({ data: { tenantId, code: 'USD', name: 'Amerikan Doları', symbol: '$', defaultRate: 32.5 } }),
    prisma.currency.create({ data: { tenantId, code: 'EUR', name: 'Euro', symbol: '€', defaultRate: 35.2 } }),
    prisma.currency.create({ data: { tenantId, code: 'GBP', name: 'İngiliz Sterlini', symbol: '£', defaultRate: 41.0 } }),
  ]);

  // Currency Rates
  await prisma.currencyRate.createMany({
    data: [
      { tenantId, currencyCode: 'USD', rate: 32.45, date: d('2026-05-02'), source: 'CENTRAL_BANK' },
      { tenantId, currencyCode: 'EUR', rate: 35.18, date: d('2026-05-02'), source: 'CENTRAL_BANK' },
      { tenantId, currencyCode: 'USD', rate: 32.50, date: d('2026-05-03'), source: 'CENTRAL_BANK' },
      { tenantId, currencyCode: 'EUR', rate: 35.22, date: d('2026-05-03'), source: 'CENTRAL_BANK' },
      { tenantId, currencyCode: 'USD', rate: 32.48, date: d('2026-05-04'), source: 'CENTRAL_BANK' },
      { tenantId, currencyCode: 'EUR', rate: 35.20, date: d('2026-05-04'), source: 'CENTRAL_BANK' },
    ],
  });

  // Ledger Accounts (Tekdüzen Hesap Planı)
  const accounts = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId, code: '100', name: 'Kasa', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '102', name: 'Bankalar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '120', name: 'Alıcılar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '153', name: 'Ticari Mallar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '191', name: 'İndirilecek KDV', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '320', name: 'Satıcılar', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '391', name: 'Hesaplanan KDV', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '500', name: 'Sermaye', accountType: 'EQUITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '600', name: 'Yurt İçi Satışlar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '601', name: 'Yurt Dışı Satışlar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '621', name: 'Satılan Ticari Mallar Maliyeti', accountType: 'EXPENSE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '760', name: 'Pazarlama Giderleri', accountType: 'EXPENSE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '770', name: 'Genel Yönetim Giderleri', accountType: 'EXPENSE' } }),
  ]);

  // Fiscal Period
  const fiscalPeriod = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Yılı', startDate: d('2026-01-01'), endDate: d('2026-12-31'), status: 'OPEN' },
  });

  // Number Sequences
  const seqModules = [
    { module: 'invoice', prefix: 'INV-' },
    { module: 'sales_quote', prefix: 'TKL-' },
    { module: 'sales_order', prefix: 'SIP-' },
    { module: 'purchase_request', prefix: 'PR-' },
    { module: 'purchase_order', prefix: 'PO-' },
    { module: 'journal', prefix: 'JE-' },
    { module: 'stock_count', prefix: 'SC-' },
    { module: 'delivery_note', prefix: 'DN-' },
    { module: 'work_order', prefix: 'WO-' },
    { module: 'service_request', prefix: 'SR-' },
    { module: 'edocument', prefix: 'GIB-' },
  ];
  for (const s of seqModules) {
    await prisma.numberSequence.create({ data: { tenantId, module: s.module, prefix: s.prefix, lastNum: 25, padding: 6 } });
  }

  return {
    unitAdet, unitKg, unitLt, unitMt, unitKutu, unitPaket,
    catBilgisayar, catTelefon, catAksesuar, catOfis, catHammadde, catYarimMamul, catElektronik,
    kdv0, kdv10, kdv20, tevkifat510, tevkifat710,
    accounts, fiscalPeriod,
  };
}

// ─────────────────────────────────────────────
// WAREHOUSES & LOCATIONS
// ─────────────────────────────────────────────

async function seedWarehouses(tenantId: string) {
  const warehouse = await prisma.warehouse.create({
    data: { tenantId, name: 'Ana Depo', code: 'WH01', address: 'Dudullu OSB, İstanbul' },
  });
  const warehouse2 = await prisma.warehouse.create({
    data: { tenantId, name: 'Üretim Deposu', code: 'WH02', address: 'Dudullu OSB Blok B, İstanbul' },
  });

  const locations = await Promise.all([
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id, name: 'Raf A-1', code: 'A-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id, name: 'Raf A-2', code: 'A-2' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id, name: 'Raf B-1', code: 'B-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id, name: 'Raf B-2', code: 'B-2' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse2.id, name: 'Üretim Alanı', code: 'P-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse2.id, name: 'Hammadde Rafı', code: 'P-2' } }),
  ]);

  return { warehouse, warehouse2, locations };
}

// ─────────────────────────────────────────────
// PRODUCTS & STOCK
// ─────────────────────────────────────────────

async function seedProducts(
  tenantId: string,
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
  warehouse2: { id: string },
  locations: { id: string }[],
) {
  const { unitAdet, unitKg, catBilgisayar, catTelefon, catAksesuar, catOfis, catHammadde, catYarimMamul, kdv10, kdv20 } = master;

  const productDefs = [
    { code: 'P001', name: 'Laptop Pro 15"', unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 18000, sellPrice: 24999, minStock: 5, avgCost: 18000, qty: 12, locIdx: 0 },
    { code: 'P002', name: 'Mekanik Klavye RGB', unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 800, sellPrice: 1299, minStock: 10, avgCost: 800, qty: 45, locIdx: 0 },
    { code: 'P003', name: 'Kablosuz Mouse Pro', unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 350, sellPrice: 599, minStock: 15, avgCost: 350, qty: 38, locIdx: 1 },
    { code: 'P004', name: 'Akıllı Telefon X12', unitId: unitAdet.id, catId: catTelefon.id, taxId: kdv20.id, buyPrice: 12000, sellPrice: 16999, minStock: 8, avgCost: 12000, qty: 7, locIdx: 1 },
    { code: 'P005', name: 'USB-C Hub 7 Port', unitId: unitAdet.id, catId: catAksesuar.id, taxId: kdv20.id, buyPrice: 280, sellPrice: 499, minStock: 20, avgCost: 280, qty: 62, locIdx: 2 },
    { code: 'P006', name: 'A4 Fotokopi Kağıdı 500 yp', unitId: unitAdet.id, catId: catOfis.id, taxId: kdv10.id, buyPrice: 85, sellPrice: 120, minStock: 50, avgCost: 85, qty: 3, locIdx: 2 },
    { code: 'P007', name: 'Tükenmez Kalem Seti 12li', unitId: unitAdet.id, catId: catOfis.id, taxId: kdv10.id, buyPrice: 45, sellPrice: 79, minStock: 30, avgCost: 45, qty: 28, locIdx: 0 },
    { code: 'P008', name: 'Monitor 27" 4K IPS', unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 7500, sellPrice: 10999, minStock: 3, avgCost: 7500, qty: 2, locIdx: 1 },
    { code: 'P009', name: 'Webcam 4K Otofokus', unitId: unitAdet.id, catId: catAksesuar.id, taxId: kdv20.id, buyPrice: 1200, sellPrice: 1999, minStock: 10, avgCost: 1200, qty: 15, locIdx: 3 },
    { code: 'P010', name: 'SSD 1TB NVMe', unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 1800, sellPrice: 2799, minStock: 12, avgCost: 1800, qty: 22, locIdx: 3 },
    // Hammadde / Yarı Mamul (üretim için)
    { code: 'HM001', name: 'Alüminyum Profil 1m', unitId: unitKg.id, catId: catHammadde.id, taxId: kdv20.id, buyPrice: 45, sellPrice: 0, minStock: 100, avgCost: 45, qty: 250, locIdx: 4 },
    { code: 'HM002', name: 'Plastik Granül', unitId: unitKg.id, catId: catHammadde.id, taxId: kdv20.id, buyPrice: 28, sellPrice: 0, minStock: 200, avgCost: 28, qty: 480, locIdx: 5 },
    { code: 'YM001', name: 'Laptop Kasası (Yarı Mamul)', unitId: unitAdet.id, catId: catYarimMamul.id, taxId: kdv20.id, buyPrice: 850, sellPrice: 0, minStock: 20, avgCost: 850, qty: 35, locIdx: 4 },
  ];

  const products = [];
  for (const p of productDefs) {
    const product = await prisma.product.create({
      data: {
        tenantId, code: p.code, name: p.name,
        unitId: p.unitId, categoryId: p.catId, taxRateId: p.taxId,
        purchasePrice: p.buyPrice, salesPrice: p.sellPrice,
        minStockLevel: p.minStock, averageCost: p.avgCost,
      },
    });

    const warehouseId = p.locIdx >= 4 ? warehouse2.id : warehouse.id;
    const locationId = locations[p.locIdx]?.id ?? '';

    await prisma.stockLevel.create({
      data: { tenantId, productId: product.id, warehouseId, locationId, quantity: p.qty },
    });
    await prisma.stockMovement.create({
      data: { tenantId, productId: product.id, type: 'OPENING', quantity: p.qty, toWarehouseId: warehouseId, notes: 'Açılış stoğu' },
    });

    products.push(product);
  }

  return products;
}

// ─────────────────────────────────────────────
// CONTACTS (Customers & Suppliers)
// ─────────────────────────────────────────────

async function seedContacts(tenantId: string) {
  return Promise.all([
    // Müşteriler
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Teknoloji Çözümleri Ltd.', code: 'C001', taxNumber: '9876543210', taxOffice: 'Şişli', email: 'satin@teknolojicozmler.com', phone: '+90 212 444 0001', city: 'İstanbul', creditLimit: 150000, paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Dijital Medya A.Ş.', code: 'C002', taxNumber: '1122334455', taxOffice: 'Beşiktaş', email: 'muhasebe@dijitalmedya.com', phone: '+90 212 444 0002', city: 'İstanbul', creditLimit: 75000, paymentTermDays: 15 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Mavi Yazılım Koop.', code: 'C003', taxNumber: '5544332211', taxOffice: 'Ankara', email: 'finans@maviyazilim.com', phone: '+90 312 444 0003', city: 'Ankara', creditLimit: 50000, paymentTermDays: 45 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Yıldız Holding A.Ş.', code: 'C004', taxNumber: '3344556677', taxOffice: 'Levent', email: 'it@yildizholding.com', phone: '+90 212 444 0004', city: 'İstanbul', creditLimit: 500000, paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Ege Üniversitesi', code: 'C005', taxNumber: '7788990011', taxOffice: 'Bornova', email: 'satin@ege.edu.tr', phone: '+90 232 444 0005', city: 'İzmir', creditLimit: 200000, paymentTermDays: 90 } }),
    // Tedarikçiler
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'Global Elektronik Dağıtım', code: 'S001', taxNumber: '6677889900', taxOffice: 'Ümraniye', email: 'satis@globalelektronik.com', phone: '+90 216 555 0010', city: 'İstanbul', paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'Ofis Dünyası Toptan', code: 'S002', taxNumber: '1029384756', taxOffice: 'Bağcılar', email: 'siparis@ofisdunyasi.com', phone: '+90 212 555 0020', city: 'İstanbul', paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'TechParts İthalat', code: 'S003', taxNumber: '2233445566', taxOffice: 'Esenyurt', email: 'import@techparts.com', phone: '+90 212 555 0030', city: 'İstanbul', paymentTermDays: 45 } }),
    // Hem müşteri hem tedarikçi
    prisma.contact.create({ data: { tenantId, type: 'BOTH', name: 'İnovasyon Teknoloji', code: 'B001', taxNumber: '9988776655', taxOffice: 'Maslak', email: 'info@inovasyon.tech', phone: '+90 212 555 0040', city: 'İstanbul', creditLimit: 100000, paymentTermDays: 30 } }),
  ]);
}

// ─────────────────────────────────────────────
// SALES (Quotes, Orders, DeliveryNotes, Invoices, Payments)
// ─────────────────────────────────────────────

async function seedSales(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  products: { id: string }[],
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
) {
  const { kdv20, tevkifat510 } = master;
  const [c1, c2, c3, c4, c5] = contacts;

  // ── Sales Quotes ─────────────────────────────
  const quote1 = await prisma.salesQuote.create({
    data: {
      tenantId, contactId: c1.id, number: 'TKL-000001',
      date: d('2026-03-15'), validUntil: d('2026-04-15'), status: 'ACCEPTED',
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ]
      },
    },
  });

  await prisma.salesQuote.create({
    data: {
      tenantId, contactId: c4.id, number: 'TKL-000002',
      date: d('2026-04-01'), validUntil: d('2026-05-01'), status: 'SENT',
      totalNet: 87992, totalTax: 17598.4, totalGross: 105590.4,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x4', quantity: 4, unitPrice: 24999, discount: 5, taxRate: 20, taxAmount: 19199.04, lineTotal: 114994.24, sortOrder: 0 },
          { tenantId, productId: products[7].id, description: 'Monitor 27" 4K x4', quantity: 4, unitPrice: 10999, discount: 5, taxRate: 20, taxAmount: 8399.24, lineTotal: 50395.24, sortOrder: 1 },
        ]
      },
    },
  });

  // ── Sales Orders ─────────────────────────────
  const order1 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c1.id, quoteId: quote1.id, number: 'SIP-000001',
      date: d('2026-03-20'), dueDate: d('2026-04-20'), status: 'DELIVERED',
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4, invoicedAmount: 31556.4,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, delivered: 1, sortOrder: 0 },
          { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, delivered: 2, sortOrder: 1 },
        ]
      },
    },
  });
  await prisma.salesOrderHistory.createMany({
    data: [
      { tenantId, orderId: order1.id, toStatus: 'DRAFT', notes: 'Sipariş taslağı oluşturuldu' },
      { tenantId, orderId: order1.id, fromStatus: 'DRAFT', toStatus: 'CONFIRMED', notes: 'Müşteri onayı alındı' },
      { tenantId, orderId: order1.id, fromStatus: 'CONFIRMED', toStatus: 'DELIVERED', notes: 'Eksiksiz teslim edildi' },
    ],
  });

  const order2 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c2.id, number: 'SIP-000002',
      date: d('2026-03-25'), dueDate: d('2026-04-10'), status: 'CONFIRMED',
      totalNet: 6495, totalTax: 1299, totalGross: 7794,
      items: {
        create: [
          { tenantId, productId: products[1].id, description: 'Mekanik Klavye RGB x5', quantity: 5, unitPrice: 1299, discount: 0, taxRate: 20, taxAmount: 1299, lineTotal: 7794, sortOrder: 0 },
        ]
      },
    },
  });

  const order3 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c3.id, number: 'SIP-000003',
      date: d('2026-04-05'), dueDate: d('2026-05-05'), status: 'PARTIALLY_DELIVERED',
      totalNet: 4990, totalTax: 998, totalGross: 5988,
      items: {
        create: [
          { tenantId, productId: products[4].id, description: 'USB-C Hub 7 Port x10', quantity: 10, unitPrice: 499, discount: 0, taxRate: 20, taxAmount: 998, lineTotal: 5988, delivered: 5, sortOrder: 0 },
        ]
      },
    },
  });

  const order4 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c5.id, number: 'SIP-000004',
      date: d('2026-04-15'), dueDate: d('2026-07-15'), status: 'DRAFT',
      totalNet: 109990, totalTax: 21998, totalGross: 131988,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x4', quantity: 4, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 19999.2, lineTotal: 119995.2, sortOrder: 0 },
          { tenantId, productId: products[8].id, description: 'Webcam 4K x5', quantity: 5, unitPrice: 1999, discount: 0, taxRate: 20, taxAmount: 1999, lineTotal: 11994, sortOrder: 1 },
        ]
      },
    },
  });

  // ── Delivery Notes ────────────────────────────
  const dn1 = await prisma.deliveryNote.create({
    data: {
      tenantId, number: 'DN-000001', type: 'OUTBOUND', status: 'DELIVERED',
      salesOrderId: order1.id, contactId: c1.id, warehouseId: warehouse.id,
      date: d('2026-03-22'), shippedAt: d('2026-03-22'), deliveredAt: d('2026-03-23'),
      carrier: 'Yurtiçi Kargo', trackingNumber: 'YK123456789',
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15"', orderedQty: 1, deliveredQty: 1, sortOrder: 0 },
          { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', orderedQty: 2, deliveredQty: 2, sortOrder: 1 },
        ]
      },
    },
  });

  const dn2 = await prisma.deliveryNote.create({
    data: {
      tenantId, number: 'DN-000002', type: 'OUTBOUND', status: 'SHIPPED',
      salesOrderId: order3.id, contactId: c3.id, warehouseId: warehouse.id,
      date: d('2026-04-08'), shippedAt: d('2026-04-08'),
      carrier: 'MNG Kargo', trackingNumber: 'MNG987654321',
      items: {
        create: [
          { tenantId, productId: products[4].id, description: 'USB-C Hub 7 Port x5', orderedQty: 5, deliveredQty: 5, sortOrder: 0 },
        ]
      },
    },
  });

  // ── Invoices ─────────────────────────────────
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c1.id, salesOrderId: order1.id,
      type: 'SALES', status: 'PAID', number: 'INV-000001',
      date: d('2026-03-22'), dueDate: d('2026-04-22'),
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      lines: {
        create: [
          { tenantId, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId, productId: products[2].id, taxRateId: kdv20.id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599, discount: 5, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ]
      },
    },
  });
  await prisma.invoiceHistory.createMany({
    data: [
      { tenantId, invoiceId: inv1.id, toStatus: 'DRAFT', notes: 'Fatura oluşturuldu' },
      { tenantId, invoiceId: inv1.id, fromStatus: 'DRAFT', toStatus: 'SENT', notes: 'GİB e-Fatura olarak iletildi' },
      { tenantId, invoiceId: inv1.id, fromStatus: 'SENT', toStatus: 'PAID', notes: 'Garanti BBVA EFT ile tahsil edildi' },
    ],
  });

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c2.id,
      type: 'SALES', status: 'SENT', number: 'INV-000002',
      date: d('2026-03-28'), dueDate: d('2026-04-12'),
      totalNet: 16999, totalTax: 3399.8, totalGross: 20398.8,
      lines: {
        create: [
          { tenantId, productId: products[3].id, taxRateId: kdv20.id, description: 'Akıllı Telefon X12', quantity: 1, unitPrice: 16999, discount: 0, taxAmount: 3399.8, lineTotal: 20398.8, sortOrder: 0 },
        ]
      },
    },
  });

  // inv3: Gecikmiş fatura (Collection Reminder & EDocument Exception Center testi için)
  const inv3 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c3.id,
      type: 'SALES', status: 'OVERDUE', number: 'INV-000003',
      date: d('2026-02-15'), dueDate: d('2026-03-01'),
      totalNet: 4990, totalTax: 998, totalGross: 5988,
      lines: {
        create: [
          { tenantId, productId: products[4].id, taxRateId: kdv20.id, description: 'USB-C Hub 7 Port x10', quantity: 10, unitPrice: 499, discount: 0, taxAmount: 998, lineTotal: 5988, sortOrder: 0 },
        ]
      },
    },
  });

  // inv4: Tevkifatlı fatura örneği
  const inv4 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c4.id,
      type: 'SALES', status: 'DRAFT', number: 'INV-000004',
      date: d('2026-04-20'), dueDate: d('2026-06-20'),
      totalNet: 49998, totalTax: 9999.6, totalGross: 54998.8, totalWithholding: 4999.8,
      lines: {
        create: [
          {
            tenantId, productId: products[0].id, taxRateId: kdv20.id, withholdingRateId: tevkifat510.id,
            description: 'Laptop Pro 15" x2 (5/10 Tevkifatlı)', quantity: 2, unitPrice: 24999, discount: 0,
            taxAmount: 9999.6, withholdingAmount: 4999.8, lineTotal: 54998.8, sortOrder: 0,
          },
        ]
      },
    },
  });

  // ── Bank & Cash Accounts ──────────────────────
  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId, name: 'Garanti Vadesiz TRY', bankName: 'Garanti BBVA', accountNumber: '1234567', iban: 'TR12 0006 2000 1234 5678 9012 34', currencyCode: 'TRY' },
  });
  const bankAccountUSD = await prisma.bankAccount.create({
    data: { tenantId, name: 'Garanti USD Hesabı', bankName: 'Garanti BBVA', accountNumber: '7654321', iban: 'TR98 0006 2000 7654 3210 9876 54', currencyCode: 'USD' },
  });
  const cashTRY = await prisma.cashAccount.create({ data: { tenantId, name: 'Merkez Kasa TRY', currencyCode: 'TRY' } });
  const cashUSD = await prisma.cashAccount.create({ data: { tenantId, name: 'Döviz Kasası USD', currencyCode: 'USD' } });

  // ── Payments & Allocations ───────────────────
  const pay1 = await prisma.payment.create({
    data: {
      tenantId, contactId: c1.id, bankAccountId: bankAccount.id, date: d('2026-03-25'),
      amount: 31556.4, method: 'BANK_TRANSFER', reference: 'EFT-2026-001', status: 'COMPLETED',
      notes: 'INV-000001 tam ödemesi',
    },
  });
  await prisma.paymentAllocation.create({ data: { tenantId, paymentId: pay1.id, invoiceId: inv1.id, amount: 31556.4 } });

  const pay2 = await prisma.payment.create({
    data: {
      tenantId, contactId: c2.id, bankAccountId: bankAccount.id, date: d('2026-04-10'),
      amount: 10000, method: 'BANK_TRANSFER', reference: 'EFT-2026-003', status: 'COMPLETED',
      notes: 'INV-000002 kısmi tahsilat',
    },
  });
  await prisma.paymentAllocation.create({ data: { tenantId, paymentId: pay2.id, invoiceId: inv2.id, amount: 10000 } });

  // ── Account Entries ───────────────────────────
  await prisma.accountEntry.createMany({
    data: [
      { tenantId, contactId: c1.id, date: d('2026-03-22'), debit: 31556.4, credit: 0, balance: 31556.4, description: 'INV-000001 satış faturası', refType: 'INVOICE', refId: inv1.id },
      { tenantId, contactId: c1.id, date: d('2026-03-25'), debit: 0, credit: 31556.4, balance: 0, description: 'EFT-2026-001 ödeme', refType: 'PAYMENT', refId: pay1.id },
      { tenantId, contactId: c2.id, date: d('2026-03-28'), debit: 20398.8, credit: 0, balance: 20398.8, description: 'INV-000002 satış faturası', refType: 'INVOICE', refId: inv2.id },
      { tenantId, contactId: c2.id, date: d('2026-04-10'), debit: 0, credit: 10000, balance: 10398.8, description: 'EFT-2026-003 kısmi ödeme', refType: 'PAYMENT', refId: pay2.id },
      { tenantId, contactId: c3.id, date: d('2026-02-15'), debit: 5988, credit: 0, balance: 5988, description: 'INV-000003 satış faturası (gecikmiş)', refType: 'INVOICE', refId: inv3.id },
    ],
  });

  return {
    invoices: [inv1, inv2, inv3, inv4],
    payments: [pay1, pay2],
    deliveryNotes: [dn1, dn2],
    orders: [order1, order2, order3, order4],
    bankAccount, bankAccountUSD, cashTRY, cashUSD,
  };
}

// ─────────────────────────────────────────────
// E-DOCUMENTS (E-Fatura, E-Arşiv, E-İrsaliye & Exceptions)
// ─────────────────────────────────────────────

async function seedEDocuments(
  tenantId: string,
  invoices: { id: string }[],
  deliveryNotes: { id: string }[],
) {
  // 1. Onaylanmış E-Fatura (GİB Başarılı)
  await prisma.eDocument.create({
    data: {
      tenantId,
      invoiceId: invoices[0].id,
      type: EDocumentType.E_INVOICE,
      status: EDocumentStatus.ACCEPTED,
      uuid: 'e7b1a2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
      providerCode: 'GIB_200',
      providerMessage: '1300: Belge GİB sisteminde başarıyla doğrulandı ve alıcıya iletildi.',
      sentAt: d('2026-03-22T10:15:00'),
      acceptedAt: d('2026-03-22T10:18:22'),
      requestPayload: { profileId: 'TICARIFATURA', invoiceTypeCode: 'SATIS', currency: 'TRY', lineCount: 2 },
      responsePayload: { envelopeId: 'ENV-20260322-001', statusCode: 1300 },
    },
  });

  // 2. Gönderilmiş E-Arşiv Fatura
  await prisma.eDocument.create({
    data: {
      tenantId,
      invoiceId: invoices[1].id,
      type: EDocumentType.E_ARCHIVE,
      status: EDocumentStatus.SENT,
      uuid: 'f8c2b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      providerCode: 'GIB_100',
      providerMessage: 'E-Arşiv raporu oluşturuldu, GİB kuyruğunda bekliyor.',
      sentAt: d('2026-03-28T14:30:00'),
      requestPayload: { profileId: 'EARSIVFATURA', sendType: 'ELEKTRONIK' },
    },
  });

  // 3. Hatalı E-Fatura (Exception Center için mükemmel test senaryosu)
  await prisma.eDocument.create({
    data: {
      tenantId,
      invoiceId: invoices[2].id,
      type: EDocumentType.E_INVOICE,
      status: EDocumentStatus.ERROR,
      uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e',
      providerCode: 'GIB_400',
      providerMessage: '1163: Gönderilen faturada alıcı VKN/TCKN bilgisi GİB e-Fatura mükellef listesinde bulunamadı.',
      retryCount: 2,
      lastRetryAt: d('2026-02-16T11:00:00'),
      sentAt: d('2026-02-15T09:00:00'),
      requestPayload: { recipientVkn: '5544332211', profileId: 'TICARIFATURA' },
      responsePayload: { errorDetail: 'Recipient is not registered in PK registry' },
    },
  });

  // 4. Taslak E-Arşiv
  await prisma.eDocument.create({
    data: {
      tenantId,
      invoiceId: invoices[3].id,
      type: EDocumentType.E_ARCHIVE,
      status: EDocumentStatus.PENDING,
      retryCount: 0,
    },
  });

  // 5. Başarılı E-İrsaliye
  await prisma.eDocument.create({
    data: {
      tenantId,
      deliveryNoteId: deliveryNotes[0].id,
      type: EDocumentType.E_WAYBILL,
      status: EDocumentStatus.ACCEPTED,
      uuid: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      providerCode: 'GIB_200',
      providerMessage: '1300: E-İrsaliye taşıyıcı ve alıcı onayına sunuldu.',
      sentAt: d('2026-03-22T11:45:00'),
      acceptedAt: d('2026-03-22T12:00:00'),
      requestPayload: { carrier: 'Yurtiçi Kargo', plate: '34 YK 1234' },
    },
  });
}

// ─────────────────────────────────────────────
// COLLECTION REMINDERS
// ─────────────────────────────────────────────

async function seedCollectionReminders(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  invoices: { id: string }[],
) {
  await prisma.collectionReminder.createMany({
    data: [
      {
        tenantId,
        contactId: contacts[2].id, // Mavi Yazılım
        invoiceId: invoices[2].id, // INV-000003
        amount: 5988.0,
        dueDate: d('2026-03-01'),
        status: 'SENT',
        notes: '1. Seviye Vade Hatırlatma E-postası ve SMS müşteriye otomatik iletildi.',
        createdAt: d('2026-03-05'),
      },
      {
        tenantId,
        contactId: contacts[2].id,
        invoiceId: invoices[2].id,
        amount: 5988.0,
        dueDate: d('2026-03-01'),
        status: 'PENDING',
        notes: '2. Seviye telefon araması planlandı - Muhasebe sorumlusu doğrudan arayacak.',
        createdAt: d('2026-03-20'),
      },
      {
        tenantId,
        contactId: contacts[1].id,
        invoiceId: invoices[1].id,
        amount: 10398.8,
        dueDate: d('2026-04-12'),
        status: 'CANCELLED',
        notes: 'Kısmi ödeme alındığı için hatırlatma iptal edildi.',
        createdAt: d('2026-04-10'),
      },
    ],
  });
}

// ─────────────────────────────────────────────
// PURCHASING
// ─────────────────────────────────────────────

async function seedPurchasing(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  products: { id: string }[],
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
) {
  const { kdv20 } = master;
  const supplier1 = contacts[5]; // S001
  const supplier2 = contacts[6]; // S002

  // Purchase Request 1 (Onaylanmış ve siparişe dönüşmüş)
  const pr1 = await prisma.purchaseRequest.create({
    data: {
      tenantId, number: 'PR-000001', date: d('2026-04-01'), status: 'APPROVED',
      approvedAt: d('2026-04-02'), totalEstimated: 54000,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000 },
          { tenantId, productId: products[7].id, description: 'Monitor 27" 4K x2', quantity: 2, unitPrice: 7500 },
        ]
      },
    },
  });

  // Purchase Request 2 (Onay Bekleyen - Approval Flow için)
  const pr2 = await prisma.purchaseRequest.create({
    data: {
      tenantId, number: 'PR-000002', date: d('2026-04-10'), status: 'PENDING_APPROVAL',
      totalEstimated: 8500,
      items: {
        create: [
          { tenantId, productId: products[5].id, description: 'A4 Kağıt x100 paket', quantity: 100, unitPrice: 85 },
        ]
      },
    },
  });

  // Purchase Order 1
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId, contactId: supplier1.id, number: 'PO-000001',
      date: d('2026-04-03'), dueDate: d('2026-06-03'), status: 'RECEIVED',
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000, discount: 0, taxRate: 20, taxAmount: 10800, lineTotal: 64800, received: 3, sortOrder: 0 },
        ]
      },
    },
  });
  await prisma.purchaseOrderHistory.createMany({
    data: [
      { tenantId, orderId: po1.id, toStatus: 'DRAFT' },
      { tenantId, orderId: po1.id, fromStatus: 'DRAFT', toStatus: 'SENT' },
      { tenantId, orderId: po1.id, fromStatus: 'SENT', toStatus: 'RECEIVED', notes: '3 adet eksiksiz teslim alındı' },
    ],
  });

  // Purchase Invoice
  const purchInv = await prisma.invoice.create({
    data: {
      tenantId, contactId: supplier1.id, purchaseOrderId: po1.id,
      type: 'PURCHASE', status: 'PAID', number: 'INV-000005',
      date: d('2026-04-05'), dueDate: d('2026-06-05'),
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      lines: {
        create: [
          { tenantId, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000, discount: 0, taxAmount: 10800, lineTotal: 64800, sortOrder: 0 },
        ]
      },
    },
  });

  await prisma.stockMovement.create({
    data: { tenantId, productId: products[0].id, type: 'IN', quantity: 3, toWarehouseId: warehouse.id, unitCost: 18000, refType: 'PURCHASE_ORDER', refId: po1.id, notes: `Satın alma teslimi: ${po1.number}` },
  });
  await prisma.stockLevel.updateMany({
    where: { tenantId, productId: products[0].id, warehouseId: warehouse.id },
    data: { quantity: { increment: 3 } },
  });

  await prisma.accountEntry.create({
    data: { tenantId, contactId: supplier1.id, date: d('2026-04-05'), debit: 0, credit: 64800, balance: -64800, description: 'INV-000005 alış faturası', refType: 'INVOICE', refId: purchInv.id },
  });

  // Purchase Order 2
  const po2 = await prisma.purchaseOrder.create({
    data: {
      tenantId, contactId: supplier2.id, number: 'PO-000002',
      date: d('2026-04-12'), dueDate: d('2026-05-12'), status: 'PARTIALLY_RECEIVED',
      totalNet: 8500, totalTax: 850, totalGross: 9350,
      items: {
        create: [
          { tenantId, productId: products[5].id, description: 'A4 Kağıt x100', quantity: 100, unitPrice: 85, discount: 0, taxRate: 10, taxAmount: 850, lineTotal: 9350, received: 50, sortOrder: 0 },
        ]
      },
    },
  });

  await prisma.purchaseRequest.update({ where: { id: pr1.id }, data: { status: 'ORDERED', purchaseOrderId: po1.id } });

  return { pr1, pr2, po1, po2, purchInv };
}

// ─────────────────────────────────────────────
// ACCOUNTING
// ─────────────────────────────────────────────

async function seedAccounting(
  tenantId: string,
  accounts: { id: string }[],
  invoices: { id: string }[],
  purchInv: { id: string },
) {
  const [, accBanka, accAlici, accMal, accIndKdv, accSatici, accHesKdv, , accSatis] = accounts;

  const fp1 = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Q1 (Ocak-Mart)', startDate: d('2026-01-01'), endDate: d('2026-03-31'), status: 'CLOSED', closedAt: d('2026-04-05') },
  });
  const fp2 = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Q2 (Nisan-Haziran)', startDate: d('2026-04-01'), endDate: d('2026-06-30'), status: 'OPEN' },
  });

  // Yevmiye Fişleri
  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp1.id, type: 'AUTO_INVOICE', number: 'JE-000001',
      date: d('2026-03-22'), description: 'INV-000001 satış faturası mahsup kaydı', isPosted: true, postedAt: d('2026-03-22'),
      lines: {
        create: [
          { tenantId, accountId: accAlici.id, debit: 31556.4, credit: 0, description: 'Alıcılar Borç', sortOrder: 0 },
          { tenantId, accountId: accSatis.id, debit: 0, credit: 26297, description: 'Yurtiçi Satış Geliri', sortOrder: 1 },
          { tenantId, accountId: accHesKdv.id, debit: 0, credit: 5259.4, description: 'Hesaplanan KDV', sortOrder: 2 },
        ]
      },
    },
  });

  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp1.id, type: 'AUTO_PAYMENT', number: 'JE-000002',
      date: d('2026-03-25'), description: 'EFT-2026-001 tahsilat fişi', isPosted: true, postedAt: d('2026-03-25'),
      lines: {
        create: [
          { tenantId, accountId: accBanka.id, debit: 31556.4, credit: 0, description: 'Garanti Bankası Giriş', sortOrder: 0 },
          { tenantId, accountId: accAlici.id, debit: 0, credit: 31556.4, description: 'Alıcı Cari Kapatma', sortOrder: 1 },
        ]
      },
    },
  });

  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp2.id, type: 'AUTO_INVOICE', number: 'JE-000003',
      date: d('2026-04-05'), description: 'INV-000005 alış faturası kaydı', isPosted: true, postedAt: d('2026-04-05'),
      lines: {
        create: [
          { tenantId, accountId: accMal.id, debit: 54000, credit: 0, description: 'Ticari Mallar Giriş', sortOrder: 0 },
          { tenantId, accountId: accIndKdv.id, debit: 10800, credit: 0, description: 'İndirilecek KDV', sortOrder: 1 },
          { tenantId, accountId: accSatici.id, debit: 0, credit: 64800, description: 'Satıcılar Alacak', sortOrder: 2 },
        ]
      },
    },
  });

  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp2.id, type: 'MANUAL', number: 'JE-000004',
      date: d('2026-04-30'), description: 'Nisan 2026 Ofis Kira Gideri', isPosted: false,
      lines: {
        create: [
          { tenantId, accountId: accounts[12].id, debit: 15000, credit: 0, description: 'Genel Yönetim / Kira', sortOrder: 0 },
          { tenantId, accountId: accBanka.id, debit: 0, credit: 15000, description: 'Garanti Bankası Çıkış', sortOrder: 1 },
        ]
      },
    },
  });

  // Mutabakat
  const recon = await prisma.reconciliation.create({
    data: { tenantId, name: 'Mart 2026 Garanti Bankası Mutabakatı', date: d('2026-03-31'), isFinalized: true, finalizedAt: d('2026-04-02') },
  });
  await prisma.reconciliationLine.createMany({
    data: [
      { tenantId, reconciliationId: recon.id, accountId: accBanka.id, refType: 'PAYMENT', refId: invoices[0].id, amount: 31556.4, isMatched: true, notes: 'EFT-2026-001 eşleşti' },
    ],
  });

  // Bank Transactions
  const bankAcc = (await prisma.bankAccount.findFirst({ where: { tenantId } }))!;
  await prisma.bankTransaction.createMany({
    data: [
      { tenantId, bankAccountId: bankAcc.id, type: 'DEPOSIT', amount: 31556.4, balanceAfter: 31556.4, date: d('2026-03-25'), description: 'EFT-2026-001 Müşteri Tahsilatı', refType: 'PAYMENT' },
      { tenantId, bankAccountId: bankAcc.id, type: 'WITHDRAWAL', amount: 64800, balanceAfter: -33243.6, date: d('2026-04-06'), description: 'PO-000001 Tedarikçi Ödemesi', refType: 'PAYMENT' },
      { tenantId, bankAccountId: bankAcc.id, type: 'DEPOSIT', amount: 10000, balanceAfter: -23243.6, date: d('2026-04-10'), description: 'EFT-2026-003 Kısmi Tahsilat', refType: 'PAYMENT' },
    ],
  });

  // Çek & Senetler
  await prisma.checkPromissoryNote.createMany({
    data: [
      { tenantId, type: 'CHECK', number: 'CHK-001', amount: 20000, currencyCode: 'TRY', issueDate: d('2026-04-01'), dueDate: d('2026-05-01'), bankName: 'Garanti BBVA', status: 'PENDING', notes: 'Müşteri çeki portföyde' },
      { tenantId, type: 'CHECK', number: 'CHK-002', amount: 15000, currencyCode: 'TRY', issueDate: d('2026-03-15'), dueDate: d('2026-04-15'), bankName: 'İş Bankası', status: 'CLEARED', notes: 'Tahsil edildi' },
      { tenantId, type: 'PROMISSORY_NOTE', number: 'SEN-001', amount: 50000, currencyCode: 'TRY', issueDate: d('2026-04-10'), dueDate: d('2026-07-10'), status: 'PENDING', notes: 'Yıldız Holding vadelendirme senedi' },
    ],
  });
}

// ─────────────────────────────────────────────
// HR & PAYROLL
// ─────────────────────────────────────────────

async function seedHR(tenantId: string) {
  const employees = await Promise.all([
    prisma.employee.create({ data: { tenantId, firstName: 'Ahmet', lastName: 'Yılmaz', email: 'ahmet@axondemo.com', phone: '+90 532 100 0001', position: 'Genel Müdür', department: 'Yönetim', hireDate: d('2020-01-15'), salary: 45000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Zeynep', lastName: 'Kaya', email: 'zeynep@axondemo.com', phone: '+90 532 100 0002', position: 'Satış Müdürü', department: 'Satış', hireDate: d('2021-03-01'), salary: 35000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Mehmet', lastName: 'Demir', email: 'mehmet@axondemo.com', phone: '+90 532 100 0003', position: 'Muhasebe Uzmanı', department: 'Muhasebe', hireDate: d('2021-06-15'), salary: 30000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Ali', lastName: 'Çelik', email: 'ali@axondemo.com', phone: '+90 532 100 0004', position: 'Depo Sorumlusu', department: 'Lojistik', hireDate: d('2022-02-01'), salary: 22000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Fatma', lastName: 'Şahin', email: 'fatma@axondemo.com', phone: '+90 532 100 0005', position: 'Yazılım Geliştirici', department: 'Teknoloji', hireDate: d('2022-09-01'), salary: 40000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Mustafa', lastName: 'Arslan', email: 'mustafa@axondemo.com', phone: '+90 532 100 0006', position: 'Satış Temsilcisi', department: 'Satış', hireDate: d('2023-01-10'), salary: 25000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Ayşe', lastName: 'Koç', email: 'ayse@axondemo.com', phone: '+90 532 100 0007', position: 'İK Uzmanı', department: 'İnsan Kaynakları', hireDate: d('2023-05-15'), salary: 28000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Hasan', lastName: 'Öztürk', email: 'hasan@axondemo.com', phone: '+90 532 100 0008', position: 'Üretim Operatörü', department: 'Üretim', hireDate: d('2024-01-08'), salary: 20000, isActive: true } }),
  ]);

  // Leave Requests
  await prisma.leaveRequest.createMany({
    data: [
      { tenantId, employeeId: employees[1].id, type: 'ANNUAL', status: 'APPROVED', startDate: d('2026-04-14'), endDate: d('2026-04-18'), days: 5, approvedAt: d('2026-04-10'), notes: 'Yıllık izin planı' },
      { tenantId, employeeId: employees[4].id, type: 'SICK', status: 'APPROVED', startDate: d('2026-04-07'), endDate: d('2026-04-08'), days: 2, approvedAt: d('2026-04-07'), notes: 'Raporlu sağlık izni' },
      { tenantId, employeeId: employees[2].id, type: 'ANNUAL', status: 'PENDING', startDate: d('2026-05-19'), endDate: d('2026-05-23'), days: 5, notes: 'Yaz tatili izin talebi' },
      { tenantId, employeeId: employees[5].id, type: 'UNPAID', status: 'REJECTED', startDate: d('2026-04-20'), endDate: d('2026-04-25'), days: 6, notes: 'Yoğun satış dönemi nedeniyle onaylanmadı' },
    ],
  });

  // Attendance
  const workDays = ['2026-04-28', '2026-04-29', '2026-04-30', '2026-05-02', '2026-05-03'];
  for (const emp of employees.slice(0, 5)) {
    for (const day of workDays) {
      await prisma.attendance.create({
        data: {
          tenantId, employeeId: emp.id, date: d(day),
          checkIn: new Date(`${day}T08:30:00`),
          checkOut: new Date(`${day}T17:30:00`),
          overtimeHours: Math.random() > 0.7 ? 1.5 : 0,
        },
      });
    }
  }

  // Payroll - Nisan 2026
  for (const emp of employees) {
    const payroll = await prisma.payroll.create({
      data: {
        tenantId, employeeId: emp.id, period: '2026-04',
        grossSalary: emp.salary, deductions: Number(emp.salary) * 0.15, netSalary: Number(emp.salary) * 0.85,
        paidAt: d('2026-04-30'), notes: 'Nisan 2026 bordro tahakkuku',
      },
    });
    await prisma.payrollItem.createMany({
      data: [
        { tenantId, payrollId: payroll.id, label: 'SGK İşçi Payı (%14)', amount: Number(emp.salary) * 0.14, isDeduction: true },
        { tenantId, payrollId: payroll.id, label: 'İşsizlik Sigortası (%1)', amount: Number(emp.salary) * 0.01, isDeduction: true },
      ],
    });
  }

  return employees;
}

// ─────────────────────────────────────────────
// PRODUCTION & CAPACITIES
// ─────────────────────────────────────────────

async function seedProduction(
  tenantId: string,
  products: { id: string }[],
  warehouse2: { id: string },
) {
  // Work Centers
  const [wcMontaj, wcTest, wcPaketleme] = await Promise.all([
    prisma.workCenter.create({ data: { tenantId, code: 'WC01', name: 'Montaj Hattı', description: 'Ürün montaj istasyonu', capacity: 8, laborRate: 150, overheadRate: 50, isActive: true } }),
    prisma.workCenter.create({ data: { tenantId, code: 'WC02', name: 'Test İstasyonu', description: 'Kalite kontrol ve test', capacity: 4, laborRate: 200, overheadRate: 60, isActive: true } }),
    prisma.workCenter.create({ data: { tenantId, code: 'WC03', name: 'Paketleme Hattı', description: 'Son paketleme ve etiket', capacity: 6, laborRate: 120, overheadRate: 40, isActive: true } }),
  ]);

  // Work Center Capacities (Son 5 iş günü kapasite ve dolulukları)
  const capacityDays = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'];
  for (const day of capacityDays) {
    await prisma.workCenterCapacity.createMany({
      data: [
        { tenantId, workCenterId: wcMontaj.id, date: d(day), capacity: 8.0, allocated: 6.5 },
        { tenantId, workCenterId: wcTest.id, date: d(day), capacity: 4.0, allocated: 3.0 },
        { tenantId, workCenterId: wcPaketleme.id, date: d(day), capacity: 6.0, allocated: 5.0 },
      ],
    });
  }

  // BOM
  const bom1 = await prisma.bOM.create({
    data: {
      tenantId, productId: products[12].id, name: 'Laptop Kasası BOM v1.0', version: '1.0', isActive: true,
      items: {
        create: [
          { tenantId, productId: products[10].id, quantity: 0.5, unit: 'KG', notes: 'Alüminyum profil', sortOrder: 0 },
          { tenantId, productId: products[11].id, quantity: 0.2, unit: 'KG', notes: 'Plastik granül', sortOrder: 1 },
        ]
      },
      routings: {
        create: [
          { tenantId, workCenterId: wcMontaj.id, name: 'Kasa Montajı', stepOrder: 1, setupTime: 15, runTime: 30 },
          { tenantId, workCenterId: wcTest.id, name: 'Kalite Kontrol', stepOrder: 2, setupTime: 5, runTime: 10 },
          { tenantId, workCenterId: wcPaketleme.id, name: 'Paketleme', stepOrder: 3, setupTime: 5, runTime: 5 },
        ]
      },
    },
  });

  // Work Orders (Tam Maliyet ve Fire Bilgileriyle)
  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId, productId: products[12].id, bomId: bom1.id, number: 'WO-000001',
      status: 'COMPLETED', plannedQty: 20, producedQty: 20,
      startDate: d('2026-04-01'), endDate: d('2026-04-05'),
      inputWarehouseId: warehouse2.id, outputWarehouseId: warehouse2.id,
      estimatedMaterialCost: 562.0, estimatedLaborCost: 350.0, estimatedOverheadCost: 120.0,
      actualMaterialCost: 570.0, actualLaborCost: 360.0, actualOverheadCost: 115.0,
      scrapQty: 1.0, scrapCost: 28.0, scrapReason: 'Montaj esnasında vida yuvası çatlağı',
      items: {
        create: [
          { tenantId, productId: products[10].id, requiredQty: 10, consumedQty: 10, sourceWarehouseId: warehouse2.id },
          { tenantId, productId: products[11].id, requiredQty: 4, consumedQty: 4, sourceWarehouseId: warehouse2.id },
        ]
      },
      operations: {
        create: [
          { tenantId, workCenterId: wcMontaj.id, name: 'Kasa Montajı', stepOrder: 1, status: 'COMPLETED', actualStartAt: d('2026-04-01'), actualEndAt: d('2026-04-03'), actualSetupTime: 15, actualRunTime: 30 },
          { tenantId, workCenterId: wcTest.id, name: 'Kalite Kontrol', stepOrder: 2, status: 'COMPLETED', actualStartAt: d('2026-04-03'), actualEndAt: d('2026-04-04'), actualSetupTime: 5, actualRunTime: 10 },
          { tenantId, workCenterId: wcPaketleme.id, name: 'Paketleme', stepOrder: 3, status: 'COMPLETED', actualStartAt: d('2026-04-04'), actualEndAt: d('2026-04-05'), actualSetupTime: 5, actualRunTime: 5 },
        ]
      },
      history: {
        create: [
          { tenantId, toStatus: 'PLANNED' },
          { tenantId, fromStatus: 'PLANNED', toStatus: 'IN_PROGRESS', notes: 'Üretime başlandı' },
          { tenantId, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', notes: '20 adet üretildi' },
        ]
      },
    },
  });

  const wo2 = await prisma.workOrder.create({
    data: {
      tenantId, productId: products[12].id, bomId: bom1.id, number: 'WO-000002',
      status: 'IN_PROGRESS', plannedQty: 15, producedQty: 8,
      startDate: d('2026-04-20'),
      inputWarehouseId: warehouse2.id, outputWarehouseId: warehouse2.id,
      estimatedMaterialCost: 420.0, estimatedLaborCost: 260.0, estimatedOverheadCost: 90.0,
      actualMaterialCost: 220.0, actualLaborCost: 140.0, actualOverheadCost: 50.0,
      items: {
        create: [
          { tenantId, productId: products[10].id, requiredQty: 7.5, consumedQty: 4, sourceWarehouseId: warehouse2.id },
          { tenantId, productId: products[11].id, requiredQty: 3, consumedQty: 1.6, sourceWarehouseId: warehouse2.id },
        ]
      },
      history: {
        create: [
          { tenantId, toStatus: 'PLANNED' },
          { tenantId, fromStatus: 'PLANNED', toStatus: 'IN_PROGRESS', notes: 'Üretime başlandı' },
        ]
      },
    },
  });

  await prisma.stockMovement.create({
    data: { tenantId, productId: products[12].id, type: 'IN', quantity: 20, toWarehouseId: warehouse2.id, refType: 'WORK_ORDER', refId: wo1.id, notes: `İş emri ${wo1.number} üretim çıktısı` },
  });
  await prisma.stockLevel.updateMany({
    where: { tenantId, productId: products[12].id, warehouseId: warehouse2.id },
    data: { quantity: { increment: 20 } },
  });

  return { bom1, workOrders: [wo1, wo2] };
}

// ─────────────────────────────────────────────
// SERVICE & ASSETS
// ─────────────────────────────────────────────

async function seedService(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  products: { id: string }[],
) {
  const [c1, c2, c3] = contacts;

  const [asset1, asset2, asset3] = await Promise.all([
    prisma.customerAsset.create({ data: { tenantId, contactId: c1.id, name: 'Laptop Pro 15" SN:LP001', brand: 'Axon', model: 'Pro 15', serialNo: 'LP-2024-001', purchaseDate: d('2024-06-15'), warrantyEnd: d('2026-06-15'), isActive: true } }),
    prisma.customerAsset.create({ data: { tenantId, contactId: c2.id, name: 'Akıllı Telefon X12 SN:AT001', brand: 'Axon', model: 'X12', serialNo: 'AT-2025-001', purchaseDate: d('2025-01-10'), warrantyEnd: d('2027-01-10'), isActive: true } }),
    prisma.customerAsset.create({ data: { tenantId, contactId: c3.id, name: 'Monitor 27" SN:MN001', brand: 'Axon', model: '27K', serialNo: 'MN-2023-001', purchaseDate: d('2023-09-20'), warrantyEnd: d('2025-09-20'), isActive: true } }),
  ]);

  const sr1 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c1.id, customerAssetId: asset1.id,
      number: 'SR-000001', status: 'COMPLETED', priority: 'HIGH',
      subject: 'Laptop ekran piksel hatası',
      description: 'Ekranın sol alt köşesinde ölü piksel var, garanti kapsamında değişim yapıldı.',
      warrantyEnd: asset1.warrantyEnd, closedAt: d('2026-04-10'),
      items: {
        create: [
          { tenantId, productId: products[0].id, description: 'Ekran değişimi parça & işçilik', quantity: 1, unitPrice: 0, lineTotal: 0 },
        ]
      },
      activities: {
        create: [
          { tenantId, activityType: 'NOTE', notes: 'Cihaz kargo ile teslim alındı', createdAt: d('2026-04-05') },
          { tenantId, activityType: 'STATUS_CHANGE', notes: 'OPEN → IN_PROGRESS' },
          { tenantId, activityType: 'CALL', notes: 'Müşteriye parça temin süresi iletildi' },
          { tenantId, activityType: 'STATUS_CHANGE', notes: 'IN_PROGRESS → COMPLETED' },
        ]
      },
      history: {
        create: [
          { tenantId, toStatus: 'OPEN' },
          { tenantId, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', notes: 'Teknik servis incelemesi' },
          { tenantId, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', notes: 'Değişim tamamlandı' },
        ]
      },
    },
  });

  const sr2 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c2.id, customerAssetId: asset2.id,
      number: 'SR-000002', status: 'IN_PROGRESS', priority: 'MEDIUM',
      subject: 'Telefon batarya şişmesi',
      description: 'Garanti kapsamında batarya değişimi yapılıyor.',
      warrantyEnd: asset2.warrantyEnd,
      history: {
        create: [
          { tenantId, toStatus: 'OPEN' },
          { tenantId, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', notes: 'Teknisyen masasında' },
        ]
      },
    },
  });

  return { asset1, asset2, asset3, sr1, sr2 };
}

// ─────────────────────────────────────────────
// MULTI-MARKETPLACE (Trendyol, Hepsiburada, Amazon)
// ─────────────────────────────────────────────

async function seedMarketplace(tenantId: string, products: { id: string }[]) {
  // 1. Trendyol
  const ty = await prisma.marketplaceIntegration.create({
    data: {
      tenantId, channel: 'TRENDYOL', name: 'Trendyol Mağazası',
      apiKey: 'ty-api-key', apiSecret: 'ty-secret', storeId: '12345',
      isActive: true, lastSyncAt: d('2026-05-03'),
    },
  });

  const tyListings = await Promise.all([
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: ty.id, productId: products[0].id, externalId: 'TY-LP001', externalSku: 'AXON-LP-001', price: 24999, stock: 10, isActive: true, lastSyncAt: d('2026-05-03') } }),
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: ty.id, productId: products[1].id, externalId: 'TY-KB001', externalSku: 'AXON-KB-001', price: 1299, stock: 40, isActive: true, lastSyncAt: d('2026-05-03') } }),
  ]);

  await prisma.marketplaceOrder.create({
    data: {
      tenantId, integrationId: ty.id, externalId: 'TY-ORD-001', channel: 'TRENDYOL',
      status: 'DELIVERED', customerName: 'Burak Yıldız', customerEmail: 'burak@email.com',
      shippingAddress: 'Kadıköy, İstanbul', totalAmount: 24999, orderDate: d('2026-04-20'),
      items: { create: [{ tenantId, externalProductId: 'TY-LP001', productId: products[0].id, name: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, lineTotal: 24999 }] },
    },
  });

  // 2. Hepsiburada
  const hb = await prisma.marketplaceIntegration.create({
    data: {
      tenantId, channel: 'HEPSIBURADA', name: 'Hepsiburada Resmi Mağaza',
      apiKey: 'hb-api-key', apiSecret: 'hb-secret', storeId: 'hb-98765',
      isActive: true, lastSyncAt: d('2026-05-04'),
    },
  });

  await prisma.marketplaceListing.create({
    data: { tenantId, integrationId: hb.id, productId: products[2].id, externalId: 'HB-MS001', externalSku: 'AXON-MS-001', price: 599, stock: 35, isActive: true, lastSyncAt: d('2026-05-04') },
  });

  await prisma.marketplaceOrder.create({
    data: {
      tenantId, integrationId: hb.id, externalId: 'HB-ORD-101', channel: 'HEPSIBURADA',
      status: 'SHIPPED', customerName: 'Ayşe Güler', customerEmail: 'ayse.guler@email.com',
      shippingAddress: 'Çankaya, Ankara', totalAmount: 1198, orderDate: d('2026-05-02'),
      items: { create: [{ tenantId, externalProductId: 'HB-MS001', productId: products[2].id, name: 'Kablosuz Mouse Pro x2', quantity: 2, unitPrice: 599, lineTotal: 1198 }] },
    },
  });

  // 3. Amazon TR
  const amz = await prisma.marketplaceIntegration.create({
    data: {
      tenantId, channel: 'AMAZON', name: 'Amazon Türkiye',
      apiKey: 'amz-api-key', apiSecret: 'amz-secret', storeId: 'amz-tr-01',
      isActive: true, lastSyncAt: d('2026-05-04'),
    },
  });

  await prisma.marketplaceListing.create({
    data: { tenantId, integrationId: amz.id, productId: products[4].id, externalId: 'AMZ-HB001', externalSku: 'AXON-HB-001', price: 499, stock: 50, isActive: true, lastSyncAt: d('2026-05-04') },
  });

  // Sync jobs & webhooks
  await prisma.marketplaceSyncJob.createMany({
    data: [
      { tenantId, integrationId: ty.id, jobType: 'SYNC_ORDERS', status: 'DONE', processedCount: 4, startedAt: d('2026-05-03'), finishedAt: d('2026-05-03') },
      { tenantId, integrationId: hb.id, jobType: 'SYNC_STOCK', status: 'DONE', processedCount: 15, startedAt: d('2026-05-04'), finishedAt: d('2026-05-04') },
    ],
  });

  await prisma.marketplaceWebhookEvent.createMany({
    data: [
      { tenantId, integrationId: ty.id, eventId: 'EVT-TY-001', eventType: 'ORDER_STATUS_CHANGED', payload: { status: 'Delivered' }, processedAt: d('2026-04-22') },
      { tenantId, integrationId: hb.id, eventId: 'EVT-HB-001', eventType: 'ORDER_STATUS_CHANGED', payload: { status: 'Shipped' }, processedAt: d('2026-05-02') },
    ],
  });

  return { ty, hb, amz };
}

// ─────────────────────────────────────────────
// ROLES, PERMISSIONS & APPROVAL FLOWS
// ─────────────────────────────────────────────

async function seedRolesAndApprovals(
  tenantId: string,
  users: { id: string; name: string }[],
  purchasing: Awaited<ReturnType<typeof seedPurchasing>>,
) {
  const [userAdmin, userSales, userAccounting, userWarehouse] = users;

  const roleSales = await prisma.role.create({
    data: {
      tenantId, name: 'Satış Temsilcisi', description: 'Satış ve CRM erişimi', isSystem: false,
      permissions: {
        create: [
          { module: 'invoicing', action: 'CREATE' },
          { module: 'invoicing', action: 'READ' },
          { module: 'invoicing', action: 'UPDATE' },
          { module: 'contacts', action: 'READ' },
          { module: 'contacts', action: 'CREATE' },
          { module: 'inventory', action: 'READ' },
        ]
      },
    },
  });

  const roleAccounting = await prisma.role.create({
    data: {
      tenantId, name: 'Muhasebe Uzmanı', description: 'Muhasebe ve finans tam erişim', isSystem: false,
      permissions: {
        create: [
          { module: 'accounting', action: 'CREATE' },
          { module: 'accounting', action: 'READ' },
          { module: 'accounting', action: 'UPDATE' },
          { module: 'invoicing', action: 'READ' },
          { module: 'invoicing', action: 'UPDATE' },
          { module: 'payroll', action: 'APPROVE' },
        ]
      },
    },
  });

  const roleWarehouse = await prisma.role.create({
    data: {
      tenantId, name: 'Depo Sorumlusu', description: 'Depo ve stok yönetimi', isSystem: false,
      permissions: {
        create: [
          { module: 'inventory', action: 'CREATE' },
          { module: 'inventory', action: 'READ' },
          { module: 'inventory', action: 'UPDATE' },
          { module: 'purchasing', action: 'READ' },
        ]
      },
    },
  });

  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userSales.id }, data: { roleId: roleSales.id } });
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userAccounting.id }, data: { roleId: roleAccounting.id } });
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userWarehouse.id }, data: { roleId: roleWarehouse.id } });

  // Onay Akışları
  const flowPurchase = await prisma.approvalFlow.create({
    data: {
      tenantId, name: 'Satın Alma Onay Akışı', module: 'PURCHASE_REQUEST', isActive: true,
      steps: {
        create: [
          { stepOrder: 1, name: 'Departman Onayı', approverRoleId: roleSales.id, isRequired: true },
          { stepOrder: 2, name: 'Finans Onayı', approverRoleId: roleAccounting.id, isRequired: true },
        ]
      },
    },
    include: { steps: true },
  });

  const flowLeave = await prisma.approvalFlow.create({
    data: {
      tenantId, name: 'İzin Onay Akışı', module: 'LEAVE_REQUEST', isActive: true,
      steps: {
        create: [
          { stepOrder: 1, name: 'Yönetici Onayı', approverUserId: userAdmin.id, isRequired: true },
        ]
      },
    },
    include: { steps: true },
  });

  // Onay İstekleri (ApprovalRequests & Actions)
  // 1. Onaylanmış Satın Alma Talebi
  const req1 = await prisma.approvalRequest.create({
    data: {
      tenantId, flowId: flowPurchase.id, entityType: 'PURCHASE_ORDER', entityId: purchasing.pr1.id,
      status: 'APPROVED', currentStep: 2, requestedBy: userWarehouse.name,
      notes: 'Acil üretim hammadde ihtiyacı için onay talebi',
      actions: {
        create: [
          { stepId: flowPurchase.steps[0].id, actionType: 'APPROVE', actorId: userSales.id, notes: 'Departman bütçesi uygun, onaylandı.' },
          { stepId: flowPurchase.steps[1].id, actionType: 'APPROVE', actorId: userAccounting.id, notes: 'Ödeme vadesi onaylandı.' },
        ]
      },
    },
  });

  // 2. Bekleyen Satın Alma Talebi (PR-000002)
  await prisma.approvalRequest.create({
    data: {
      tenantId, flowId: flowPurchase.id, entityType: 'PURCHASE_ORDER', entityId: purchasing.pr2.id,
      status: 'PENDING', currentStep: 1, requestedBy: userSales.name,
      notes: 'Ofis kırtasiye ihtiyacı için onay bekliyor.',
    },
  });

  return { roleSales, roleAccounting, roleWarehouse, flowPurchase, flowLeave, req1 };
}

// ─────────────────────────────────────────────
// COLLABORATION, TASKS, NOTIFICATIONS & MAILS
// ─────────────────────────────────────────────

async function seedCollaborationAndWorkflow(
  tenantId: string,
  users: { id: string }[],
  sales: Awaited<ReturnType<typeof seedSales>>,
  service: Awaited<ReturnType<typeof seedService>>,
) {
  const [userAdmin, userSales, userAccounting, userWarehouse] = users;
  const { invoices, orders } = sales;

  // 1. Kayıt Yorumları ve Bahsetmeler (Collaboration Entries)
  await prisma.recordCollaborationEntry.createMany({
    data: [
      {
        tenantId, entityType: 'INVOICE', entityId: invoices[0].id,
        type: 'COMMENT', content: 'Müşteri faturayı EFT ile ödedi, muhasebe teyit etti.',
        mentionIds: [userAccounting.id], createdById: userSales.id, createdAt: d('2026-03-25T11:00:00'),
      },
      {
        tenantId, entityType: 'INVOICE', entityId: invoices[2].id,
        type: 'DECISION', content: 'Vade 60 gün aşıldığı için hukuki takip öncesi son hatırlatma kararı alındı.',
        mentionIds: [userAdmin.id, userAccounting.id], createdById: userAccounting.id, createdAt: d('2026-04-02T14:30:00'),
      },
      {
        tenantId, entityType: 'SALES_ORDER', entityId: orders[0].id,
        type: 'COMMENT', content: 'Yurtiçi Kargo takip numarası sisteme girildi, sevkiyat tamamlandı.',
        mentionIds: [userSales.id], createdById: userWarehouse.id, createdAt: d('2026-03-22T16:00:00'),
      },
    ],
  });

  // 2. Kayıt Takipçileri (Record Followers)
  await prisma.recordFollower.createMany({
    data: [
      { tenantId, entityType: 'INVOICE', entityId: invoices[2].id, userId: userAccounting.id },
      { tenantId, entityType: 'INVOICE', entityId: invoices[2].id, userId: userAdmin.id },
      { tenantId, entityType: 'SALES_ORDER', entityId: orders[3].id, userId: userSales.id },
    ],
  });

  // 3. Görevler (Tasks)
  await prisma.task.createMany({
    data: [
      {
        tenantId, title: 'Mavi Yazılım (INV-000003) Tahsilat Takibi',
        detail: 'Gecikmiş fatura için şirket yetkilisi aranarak mutabakat sağlanacak.',
        type: 'COLLECTION', priority: 'HIGH', status: 'IN_PROGRESS',
        module: 'invoicing', entityType: 'INVOICE', entityId: invoices[2].id,
        assignedToId: userAccounting.id, createdById: userAdmin.id, dueAt: d('2026-05-15'),
      },
      {
        tenantId, title: 'A4 Kağıt Minimum Stok Seviyesi İncelemesi',
        detail: 'Depoda 3 paket kağıt kaldı, satın alma siparişinin teslimatı takip edilecek.',
        type: 'CHECK', priority: 'MEDIUM', status: 'TODO',
        module: 'inventory', assignedToId: userWarehouse.id, createdById: userAdmin.id, dueAt: d('2026-05-10'),
      },
      {
        tenantId, title: 'SR-000002 Telefon Batarya Değişimi Teknik Testi',
        detail: 'Montaj sonrası şarj/deşarj döngü testi yapılacak.',
        type: 'SERVICE', priority: 'MEDIUM', status: 'IN_PROGRESS',
        module: 'service', entityType: 'SERVICE_REQUEST', entityId: service.sr2.id,
        assignedToId: userSales.id, createdById: userAdmin.id, dueAt: d('2026-05-12'),
      },
      {
        tenantId, title: 'Nisan Ayı KDV Beyannamesi Onayı',
        detail: 'Vergi dairesi öncesi beyanname kontrolü ve onay süreci tamamlandı.',
        type: 'APPROVAL', priority: 'CRITICAL', status: 'DONE',
        module: 'accounting', assignedToId: userAccounting.id, createdById: userAdmin.id,
        completedAt: d('2026-04-24'),
      },
    ],
  });

  // 4. Mail Mesajları (Gelen & Giden E-postalar)
  await prisma.mailMessage.createMany({
    data: [
      {
        tenantId, direction: 'OUTBOUND', status: 'SENT', from: 'muhasebe@axondemo.com',
        to: ['satin@teknolojicozmler.com'], cc: ['satis@axondemo.com'],
        subject: 'Axon ERP - INV-000001 Numaralı Faturanız Ektedir',
        html: '<p>Sayın Müşterimiz,<br/>INV-000001 numaralı e-faturanız ekte yer almaktadır. İyi çalışmalar dileriz.</p>',
        textPreview: 'INV-000001 numaralı e-faturanız ekte yer almaktadır.',
        attachmentCount: 1, sentById: userSales.id, sentAt: d('2026-03-22T10:30:00'),
      },
      {
        tenantId, direction: 'OUTBOUND', status: 'SENT', from: 'lojistik@axondemo.com',
        to: ['satin@teknolojicozmler.com'],
        subject: 'Siparişiniz Kargoya Verildi (SIP-000001)',
        html: '<p>Siparişiniz Yurtiçi Kargo firmasına teslim edilmiştir. Takip No: YK123456789</p>',
        textPreview: 'Siparişiniz kargoya verildi. Takip no: YK123456789',
        attachmentCount: 0, sentById: userWarehouse.id, sentAt: d('2026-03-22T17:00:00'),
      },
      {
        tenantId, direction: 'INBOUND', status: 'SENT', from: 'satin@teknolojicozmler.com',
        to: ['satis@axondemo.com'],
        subject: 'Re: Siparişiniz Kargoya Verildi (SIP-000001)',
        html: '<p>Ürünleri teslim aldık, teşekkür ederiz.</p>',
        textPreview: 'Ürünleri teslim aldık, teşekkür ederiz.',
        attachmentCount: 0,
      },
      {
        tenantId, direction: 'OUTBOUND', status: 'FAILED', from: 'finans@axondemo.com',
        to: ['finans@maviyazilim.com'],
        subject: 'Vadesi Geçen Fatura Bildirimi - INV-000003',
        html: '<p>Sayın Yetkili, vadesi 01.03.2026 olan faturanızın bakiyesi 5.988,00 TL gecikmededir.</p>',
        textPreview: 'Vadesi 01.03.2026 olan faturanız gecikmededir.',
        error: 'SMTP relay connection timeout',
      },
    ],
  });

  // 5. Bildirimler (Notifications)
  await prisma.notification.createMany({
    data: [
      { tenantId, userId: userAdmin.id, title: 'Yeni Sipariş Alındı', message: 'SIP-000004 numaralı sipariş oluşturuldu.', module: 'invoicing', entityType: 'SALES_ORDER', status: 'UNREAD', createdAt: d('2026-04-15') },
      { tenantId, userId: userAdmin.id, title: 'Fatura Vadesi Yaklaşıyor', message: 'INV-000002 faturasının vadesi 3 gün sonra.', module: 'invoicing', entityType: 'INVOICE', status: 'UNREAD', createdAt: d('2026-04-09') },
      { tenantId, userId: userAdmin.id, title: 'Gecikmiş Fatura Uyarısı', message: 'INV-000003 faturası 60 gün gecikmiş.', module: 'invoicing', entityType: 'INVOICE', status: 'READ', createdAt: d('2026-04-01'), readAt: d('2026-04-02') },
      { tenantId, userId: userAdmin.id, title: 'Kritik Stok Seviyesi', message: 'P006 (A4 Kağıt) minimum stok seviyesinin altında.', module: 'inventory', entityType: 'PRODUCT', status: 'UNREAD', createdAt: d('2026-05-01') },
      { tenantId, userId: userAdmin.id, title: 'İş Emri Tamamlandı', message: 'WO-000001 iş emri tamamlandı. 20 adet üretildi.', module: 'production', entityType: 'WORK_ORDER', status: 'READ', createdAt: d('2026-04-05'), readAt: d('2026-04-06') },
      { tenantId, userId: userAdmin.id, title: 'Servis Talebi Kapatıldı', message: 'SR-000001 servis talebi başarıyla tamamlandı.', module: 'service', entityType: 'SERVICE_REQUEST', status: 'ARCHIVED', createdAt: d('2026-04-10') },
      { tenantId, userId: userAdmin.id, title: 'Hepsiburada Senkronizasyonu', message: 'HB-ORD-101 numaralı sipariş sisteme aktarıldı.', module: 'marketplace', status: 'READ', createdAt: d('2026-05-02'), readAt: d('2026-05-02') },
      { tenantId, userId: userAdmin.id, title: 'Satın Alma Onayı Bekliyor', message: 'PR-000002 satın alma talebi onayınızı bekliyor.', module: 'purchasing', entityType: 'PURCHASE_ORDER', status: 'UNREAD', createdAt: d('2026-04-10') },
    ],
  });
}

// ─────────────────────────────────────────────
// AUTOMATION ENGINE (Rules & Executions)
// ─────────────────────────────────────────────

async function seedAutomations(tenantId: string) {
  const rule1 = await prisma.automationRule.create({
    data: {
      tenantId,
      name: 'Kritik Stok Görev Tetikleyicisi',
      description: 'Ürün stoku asgari seviyenin altına indiğinde otomatik depo görevi açar.',
      trigger: 'LOW_STOCK',
      action: 'CREATE_TASK',
      module: 'inventory',
      conditions: { thresholdPercentage: 100 },
      actionConfig: { priority: 'HIGH', assignRole: 'Depo Sorumlusu' },
      isActive: true,
      lastRunAt: d('2026-05-01T08:00:00'),
      lastResult: { triggeredProducts: 1, taskCreated: true },
    },
  });

  const rule2 = await prisma.automationRule.create({
    data: {
      tenantId,
      name: 'Vadesi Geçen Faturada E-Posta Taslağı',
      description: 'Vadesi 7 gün geçen faturalar için otomatik tahsilat hatırlatma e-postası hazırlar.',
      trigger: 'OVERDUE_INVOICE',
      action: 'DRAFT_REMINDER_EMAIL',
      module: 'invoicing',
      conditions: { daysOverdue: 7 },
      actionConfig: { template: 'vade_gecikme_v1' },
      isActive: true,
      lastRunAt: d('2026-04-15T09:00:00'),
      lastResult: { draftsPrepared: 1 },
    },
  });

  const rule3 = await prisma.automationRule.create({
    data: {
      tenantId,
      name: 'Yüksek Tutarlı Satış Onayı',
      description: '100.000 TL üzeri satış siparişlerinde otomatik onay talebi başlatır.',
      trigger: 'HIGH_VALUE_INVOICE',
      action: 'REQUEST_APPROVAL',
      module: 'sales',
      conditions: { amountThreshold: 100000 },
      isActive: true,
    },
  });

  await prisma.automationExecution.createMany({
    data: [
      {
        tenantId, ruleId: rule1.id, trigger: 'LOW_STOCK', action: 'CREATE_TASK',
        entityType: 'PRODUCT', entityId: 'P006', status: 'SUCCEEDED',
        input: { productCode: 'P006', currentStock: 3, minStock: 50 },
        output: { taskId: 'task-stock-001', message: 'Depo görevi başarıyla oluşturuldu' },
        startedAt: d('2026-05-01T08:00:00'), completedAt: d('2026-05-01T08:00:02'),
      },
      {
        tenantId, ruleId: rule2.id, trigger: 'OVERDUE_INVOICE', action: 'DRAFT_REMINDER_EMAIL',
        entityType: 'INVOICE', entityId: 'INV-000003', status: 'SUCCEEDED',
        input: { invoiceNumber: 'INV-000003', daysOverdue: 15 },
        output: { mailDraftId: 'draft-001' },
        startedAt: d('2026-04-15T09:00:00'), completedAt: d('2026-04-15T09:00:01'),
      },
    ],
  });

  return { rule1, rule2, rule3 };
}

// ─────────────────────────────────────────────
// ATTACHMENTS (Invoices, Products, Assets, Tickets)
// ─────────────────────────────────────────────

async function seedAttachments(
  tenantId: string,
  sales: Awaited<ReturnType<typeof seedSales>>,
  products: { id: string }[],
  service: Awaited<ReturnType<typeof seedService>>,
  userId: string,
) {
  await prisma.attachment.createMany({
    data: [
      {
        tenantId, entityType: 'INVOICE', entityId: sales.invoices[0].id,
        fileName: 'INV-000001-Fatura.pdf', storagePath: 'tenants/axon-demo/invoices/INV-000001.pdf',
        mimeType: 'application/pdf', fileSize: 245100, category: 'OFFICIAL_DOCUMENT',
        documentKind: 'INVOICE_PDF', confidentiality: 'CONFIDENTIAL', tags: ['efatura', 'resmi'],
        uploadedById: userId,
      },
      {
        tenantId, entityType: 'PRODUCT', entityId: products[0].id,
        fileName: 'Laptop-Pro-15-Teknik-Sartname.pdf', storagePath: 'tenants/axon-demo/products/laptop-spec.pdf',
        mimeType: 'application/pdf', fileSize: 1250000, category: 'SPEC_SHEET',
        documentKind: 'MANUAL', confidentiality: 'PUBLIC', tags: ['katalog', 'bilgisayar'],
        uploadedById: userId,
      },
      {
        tenantId, entityType: 'CUSTOMER_ASSET', entityId: service.asset1.id,
        fileName: 'Garanti-Belgesi-AxonPro15.pdf', storagePath: 'tenants/axon-demo/assets/warranty-lp001.pdf',
        mimeType: 'application/pdf', fileSize: 320000, category: 'WARRANTY_CERTIFICATE',
        documentKind: 'WARRANTY', confidentiality: 'INTERNAL', tags: ['garanti', 'cihaz'],
        uploadedById: userId,
      },
      {
        tenantId, entityType: 'SERVICE_REQUEST', entityId: service.sr1.id,
        fileName: 'ekran-ariza-goruntusu.jpg', storagePath: 'tenants/axon-demo/service/sr-001-defect.jpg',
        mimeType: 'image/jpeg', fileSize: 412000, category: 'DEFECT_PHOTO',
        documentKind: 'PHOTO', confidentiality: 'INTERNAL', tags: ['servis', 'ariza'],
        uploadedById: userId,
      },
    ],
  });
}

// ─────────────────────────────────────────────
// SAVED VIEWS & DOMAIN EVENT OUTBOX
// ─────────────────────────────────────────────

async function seedSavedViewsAndOutbox(
  tenantId: string,
  userId: string,
  roleId: string,
  sales: Awaited<ReturnType<typeof seedSales>>,
) {
  // 1. Saved Views
  await prisma.savedView.createMany({
    data: [
      {
        tenantId, name: 'Vadesi Geçmiş Satış Faturaları', module: 'invoicing', listKey: 'invoices',
        scope: SavedViewScope.TENANT, isDefault: false, createdById: userId,
        state: { filters: { status: 'OVERDUE' }, sortBy: 'dueDate', sortDir: 'asc', columns: ['number', 'contact', 'dueDate', 'totalGross'] },
      },
      {
        tenantId, name: 'Kritik Stok Uyarısı Veren Ürünler', module: 'inventory', listKey: 'products',
        scope: SavedViewScope.TENANT, isDefault: true, createdById: userId,
        state: { filters: { belowMinStock: true }, sortBy: 'quantity', sortDir: 'asc' },
      },
      {
        tenantId, userId, name: 'Yüksek Kredili VIP Müşterilerim', module: 'contacts', listKey: 'contacts',
        scope: SavedViewScope.PERSONAL, isDefault: false, createdById: userId,
        state: { filters: { creditLimitMin: 100000 }, sortBy: 'creditLimit', sortDir: 'desc' },
      },
    ],
  });

  // 2. Domain Event Outbox
  await prisma.domainEventOutbox.createMany({
    data: [
      {
        tenantId, name: 'invoice.created', source: 'sales.invoice.service',
        idempotencyKey: 'outbox-inv-001', entityType: 'INVOICE', entityId: sales.invoices[0].id,
        payload: { invoiceNumber: 'INV-000001', amount: 31556.4 }, context: { actorId: userId },
        status: DomainEventOutboxStatus.PROCESSED, processedAt: d('2026-03-22T10:16:00'),
      },
      {
        tenantId, name: 'payment.completed', source: 'finance.payment.service',
        idempotencyKey: 'outbox-pay-001', entityType: 'INVOICE', entityId: sales.invoices[0].id,
        payload: { paymentRef: 'EFT-2026-001', amount: 31556.4 }, context: { actorId: userId },
        status: DomainEventOutboxStatus.PROCESSED, processedAt: d('2026-03-25T11:05:00'),
      },
      {
        tenantId, name: 'delivery_note.shipped', source: 'logistics.delivery.service',
        idempotencyKey: 'outbox-dn-001', entityType: 'DELIVERY_NOTE', entityId: sales.deliveryNotes[0].id,
        payload: { number: 'DN-000001', carrier: 'Yurtiçi Kargo' }, context: { actorId: userId },
        status: DomainEventOutboxStatus.PROCESSED, processedAt: d('2026-03-22T17:01:00'),
      },
      {
        tenantId, name: 'edocument.retry_requested', source: 'edocument.automation.service',
        idempotencyKey: 'outbox-edoc-retry-001', entityType: 'INVOICE', entityId: sales.invoices[2].id,
        payload: { edocumentId: 'edoc-err-01', reason: 'GİB VKN düzeltmesi sonrası tekrar gönderim' }, context: {},
        status: DomainEventOutboxStatus.PENDING, attempts: 1, nextRetryAt: d('2026-05-10T10:00:00'),
      },
    ],
  });
}

// ─────────────────────────────────────────────
// SAAS BILLING, SUBSCRIPTIONS & COUPONS
// ─────────────────────────────────────────────

async function seedBilling(
  tenantId: string,
  starterTenantId: string,
  proTenantId: string,
  adminUserId: string,
) {
  // Coupons
  const couponEnterprise = await prisma.billingCoupon.create({
    data: {
      code: 'ENTERPRISE2026', percent: 20, plan: 'ENTERPRISE',
      expiresAt: d('2026-12-31'), maxRedemptions: 50, redemptionCount: 4,
      description: 'Büyük Kurumsal Geçiş Kampanyası',
    },
  });

  const couponPro = await prisma.billingCoupon.create({
    data: {
      code: 'KOBIPRO30', percent: 30, plan: 'PROFESSIONAL',
      expiresAt: d('2026-12-31'), maxRedemptions: 200, redemptionCount: 38,
      description: 'KOBİ Dijital Dönüşüm İndirimi',
    },
  });

  // Subscriptions
  await prisma.billingSubscription.create({
    data: {
      tenantId, provider: 'IYZICO', providerCustomerId: 'cus_ent_001',
      state: 'ACTIVE', monthlyAmount: 14999.0, currency: 'TRY',
    },
  });

  await prisma.billingSubscription.create({
    data: {
      tenantId: proTenantId, provider: 'STRIPE', providerCustomerId: 'cus_pro_002',
      state: 'ACTIVE', monthlyAmount: 4999.0, currency: 'TRY',
    },
  });

  await prisma.billingSubscription.create({
    data: {
      tenantId: starterTenantId, provider: 'IYZICO',
      state: 'TRIALING', monthlyAmount: 1499.0, currency: 'TRY',
    },
  });

  // Pro Discount with coupon
  await prisma.subscriptionDiscount.create({
    data: {
      tenantId: proTenantId, couponId: couponPro.id, expiresAt: d('2026-12-31'),
    },
  });

  // Invoices for Enterprise Tenant
  await prisma.billingInvoice.createMany({
    data: [
      { tenantId, providerInvoiceId: 'inv_sub_2026_01', amount: 14999.0, currency: 'TRY', status: 'PAID', dueAt: d('2026-01-31'), paidAt: d('2026-01-31') },
      { tenantId, providerInvoiceId: 'inv_sub_2026_02', amount: 14999.0, currency: 'TRY', status: 'PAID', dueAt: d('2026-02-28'), paidAt: d('2026-02-28') },
      { tenantId, providerInvoiceId: 'inv_sub_2026_03', amount: 14999.0, currency: 'TRY', status: 'PAID', dueAt: d('2026-03-31'), paidAt: d('2026-03-31') },
      { tenantId, providerInvoiceId: 'inv_sub_2026_04', amount: 14999.0, currency: 'TRY', status: 'PAID', dueAt: d('2026-04-30'), paidAt: d('2026-04-30') },
    ],
  });

  // Custom Price Request
  await prisma.customPriceRequest.create({
    data: {
      tenantId, monthlyAmount: 12500.0, expiresAt: d('2026-12-31'),
      reason: '100+ kullanıcı taahhüdü kapsamında yıllık peşin ödeme özel fiyat teklifi.',
      state: 'APPLIED', requestedById: adminUserId, decidedById: adminUserId,
      decidedAt: d('2026-01-10'),
    },
  });
}

// ─────────────────────────────────────────────
// SUPPORT TICKETS (Tenant <-> Platform Admin)
// ─────────────────────────────────────────────

async function seedSupportTickets(
  tenantId: string,
  userId: string,
  adminUserId: string,
) {
  const ticket1 = await prisma.platformSupportTicket.create({
    data: {
      ticketNumber: 'TKT-2026-001',
      tenantId, createdById: userId, assignedAdminId: adminUserId,
      title: 'GİB E-Fatura Entegratör Bağlantı Hatası (1163)',
      description: 'Müşterimize e-fatura keserken 1163 VKN bulunamadı hatası almaktayız. Test ortamında mükellef doğrulaması yapılması gerekiyor.',
      category: PlatformTicketCategory.TECHNICAL, priority: PlatformTicketPriority.HIGH,
      status: PlatformTicketStatus.IN_PROGRESS,
      messages: {
        create: [
          {
            senderType: PlatformTicketSender.TENANT_USER, authorUserId: userId,
            message: 'Merhaba, e-fatura modülünde alıcı carinin VKN bilgisi doğru olmasına rağmen GİB tarafı 1163 hatası döndürüyor.',
            createdAt: d('2026-04-12T10:00:00'),
          },
          {
            senderType: PlatformTicketSender.ADMIN_USER, authorAdminId: adminUserId,
            message: 'Merhabalar Ahmet Bey, entegratör loglarını inceledik. Alıcı test ortamında kayıtlı değil, gerçek ortam ile test ortamı endpoint ayrımı güncellendi.',
            createdAt: d('2026-04-12T11:20:00'),
          },
          {
            senderType: PlatformTicketSender.ADMIN_USER, authorAdminId: adminUserId, isInternal: true,
            message: 'GİB test API servisindeki sertifika yenilendi. Kiracının endpoint parametreleri doğrulandı.',
            createdAt: d('2026-04-12T11:22:00'),
          },
        ]
      },
    },
  });

  const ticket2 = await prisma.platformSupportTicket.create({
    data: {
      ticketNumber: 'TKT-2026-002',
      tenantId, createdById: userId, assignedAdminId: adminUserId,
      title: 'Hepsiburada API Anahtarı Yetkilendirme Sorunu',
      description: 'Hepsiburada satıcı paneli üzerinden oluşturulan yeni API anahtarı sisteme bağlandı.',
      category: PlatformTicketCategory.FEATURE_REQUEST, priority: PlatformTicketPriority.MEDIUM,
      status: PlatformTicketStatus.RESOLVED, resolvedAt: d('2026-04-15T15:00:00'),
      messages: {
        create: [
          {
            senderType: PlatformTicketSender.TENANT_USER, authorUserId: userId,
            message: 'Hepsiburada entegrasyonu başarılı çalışıyor, teşekkür ederiz.',
          },
        ]
      },
    },
  });

  return { ticket1, ticket2 };
}

// ─────────────────────────────────────────────
// ENTERPRISE GOVERNANCE (API Keys, Invitations, Feature Overrides, Audit Logs, AI Requests)
// ─────────────────────────────────────────────

async function seedEnterpriseGovernance(
  tenantId: string,
  adminUserId: string,
  userSalesId: string,
) {
  // API Keys
  await prisma.apiKey.createMany({
    data: [
      {
        tenantId, name: 'B2B ERP Entegrasyon Servisi', keyPrefix: 'sk_live_b2b_',
        keyHash: await hash('sk_live_b2b_secret_key_12345'),
        scopes: ['invoices:read', 'orders:create', 'inventory:read'],
        isActive: true, lastUsedAt: d('2026-05-04T12:00:00'),
      },
      {
        tenantId, name: 'WMS El Terminali Entegrasyonu', keyPrefix: 'sk_live_wms_',
        keyHash: await hash('sk_live_wms_secret_key_67890'),
        scopes: ['inventory:read', 'inventory:write'],
        isActive: true, lastUsedAt: d('2026-05-04T09:30:00'),
      },
    ],
  });

  // Invitations
  await prisma.invitation.createMany({
    data: [
      {
        tenantId, email: 'yeni.muhasebe@axondemo.com', status: 'PENDING',
        tokenHash: 'inv_hash_001_pending', expiresAt: d('2026-06-01'), invitedBy: userSalesId,
      },
      {
        tenantId, email: 'zeynep@axondemo.com', status: 'ACCEPTED',
        tokenHash: 'inv_hash_002_accepted', expiresAt: d('2026-04-01'), acceptedAt: d('2026-03-01'), invitedBy: userSalesId,
      },
    ],
  });

  // Tenant Feature Overrides (Enterprise özel limit yükseltmeleri)
  await prisma.tenantFeatureOverride.createMany({
    data: [
      {
        tenantId, featureKey: FeatureKey.MAX_PRODUCTS, value: 'unlimited', isEnabled: true,
        reason: 'Enterprise yıllık sözleşme ek protokolü ile ürün limiti sınırsız yapıldı.',
      },
      {
        tenantId, featureKey: FeatureKey.API_ACCESS, value: 'true', isEnabled: true,
        reason: 'Harici B2B portal bağlantısı için tam API erişimi sağlandı.',
      },
    ],
  });

  // Audit Logs (Kiracı denetim izi)
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId, userId: userSalesId, module: 'invoicing', entityType: EntityType.INVOICE, entityId: 'INV-000001',
        action: AuditAction.CREATE, newValues: { number: 'INV-000001', totalGross: 31556.4 },
        ipAddress: '192.168.1.45', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: d('2026-03-22T10:00:00'),
      },
      {
        tenantId, userId: userSalesId, module: 'sales', entityType: EntityType.SALES_ORDER, entityId: 'SIP-000001',
        action: AuditAction.APPROVE, newValues: { status: 'CONFIRMED' },
        ipAddress: '192.168.1.45', createdAt: d('2026-03-20T14:15:00'),
      },
      {
        tenantId, adminId: adminUserId, module: 'platform', entityType: EntityType.OTHER, entityId: tenantId,
        action: AuditAction.UPDATE, reason: 'Plan ve modül erişimi güncellendi',
        newValues: { plan: 'ENTERPRISE', maxUsers: 100 }, createdAt: d('2026-01-01T09:00:00'),
      },
    ],
  });

  // AI Request Logs
  await prisma.aiRequestLog.createMany({
    data: [
      {
        tenantId, userId: userSalesId, requestType: 'MAIL_DRAFT', promptVersion: '1.0', model: 'gemini-1.5-pro',
        entityType: EntityType.INVOICE, entityId: 'INV-000003',
        inputSummary: 'Vadesi 15 gün geçmiş fatura için kibar ama kararlı tahsilat hatırlatma e-postası taslağı oluştur',
        outputSummary: 'Sayın Yetkili, INV-000003 numaralı faturanızın ödeme vadesi geçmiştir...',
        status: 'SUCCEEDED', tokenPrompt: 380, tokenCompletion: 140, tokenTotal: 520,
        createdAt: d('2026-04-15T09:00:00'), completedAt: d('2026-04-15T09:00:02'),
      },
      {
        tenantId, userId: userSalesId, requestType: 'SMART_FORM', promptVersion: '1.0', model: 'gemini-1.5-flash',
        entityType: EntityType.PRODUCT, entityId: 'P001',
        inputSummary: 'Laptop teknik özellik metninden kategori, birim ve vergi oranı öner',
        outputSummary: 'Kategori: Bilgisayar, KDV: %20, Birim: Adet',
        status: 'SUCCEEDED', tokenPrompt: 210, tokenCompletion: 45, tokenTotal: 255,
        createdAt: d('2026-03-10T11:00:00'), completedAt: d('2026-03-10T11:00:01'),
      },
    ],
  });

  // Support Session & Notes
  await prisma.tenantSupportNote.create({
    data: {
      tenantId, authorId: adminUserId,
      body: 'Kiracı e-fatura canlı geçişini tamamladı, ilk 10 faturada sorun yaşanmadı.',
      ticketId: 'TKT-2026-001',
    },
  });

  await prisma.supportSession.create({
    data: {
      tenantId, adminId: adminUserId, adminSessionId: 'sess-admin-01', targetUserId: userSalesId,
      reason: 'GİB bağlantı test parametrelerinin canlı incelenmesi', ticketId: 'TKT-2026-001',
      scopes: ['invoicing:read', 'settings:read'], expiresAt: d('2026-05-15'), approvedAt: d('2026-05-04'),
    },
  });
}

// ─────────────────────────────────────────────
// PLATFORM OBSERVABILITY, INCIDENTS, SECURITY & DISASTER RECOVERY
// ─────────────────────────────────────────────

async function seedPlatformHealth(tenantId: string, adminUserId: string) {
  // 1. Observability Metrics & SLOs
  await prisma.observabilitySlo.createMany({
    data: [
      {
        id: 'slo-api-uptime', name: 'Core API Availability', scope: 'platform', scopeId: 'global',
        metricKey: 'http_request_success_ratio', targetPercentage: 99.900, windowDays: 30,
        owner: 'SRE Ekibi', runbookUrl: 'https://wiki.axonerp.com/runbooks/slo-uptime', notificationChannel: '#alerts-slo',
      },
      {
        id: 'slo-api-latency', name: 'P95 API Response Latency', scope: 'platform', scopeId: 'global',
        metricKey: 'http_request_duration_p95', targetPercentage: 98.500, windowDays: 7,
        owner: 'Backend Ekibi', runbookUrl: 'https://wiki.axonerp.com/runbooks/slo-latency', notificationChannel: '#alerts-perf',
      },
    ],
  });

  const now = new Date();
  await prisma.observabilityMetricPoint.createMany({
    data: [
      { metricKey: 'api_latency_p95', scope: 'tenant', scopeId: tenantId, value: 142.5, bucketAt: new Date(now.getTime() - 3600000) },
      { metricKey: 'api_latency_p95', scope: 'tenant', scopeId: tenantId, value: 138.2, bucketAt: now },
      { metricKey: 'cpu_usage_pct', scope: 'cluster', scopeId: 'prod-app-01', value: 34.5, bucketAt: now },
      { metricKey: 'memory_usage_pct', scope: 'cluster', scopeId: 'prod-app-01', value: 42.8, bucketAt: now },
    ],
  });

  await prisma.observabilityAlertHistory.createMany({
    data: [
      {
        fingerprint: 'fp-mem-prod-01', metricKey: 'memory_usage_pct', scope: 'cluster', scopeId: 'prod-app-01',
        severity: 'WARNING', status: 'RESOLVED', value: 85.4, threshold: 80.0,
        owner: 'SRE Ekibi', runbookUrl: 'https://wiki.axonerp.com/runbooks/mem-spike', notificationChannel: '#alerts',
        openedAt: d('2026-05-02T04:10:00'), resolvedAt: d('2026-05-02T04:35:00'),
      },
      {
        fingerprint: 'fp-sync-hb-01', metricKey: 'sync_delay_seconds', scope: 'marketplace', scopeId: 'hepsiburada',
        severity: 'LOW', status: 'SILENCED', value: 120, threshold: 60,
        owner: 'Entegrasyon Ekibi', runbookUrl: 'https://wiki.axonerp.com/runbooks/marketplace-lag', notificationChannel: '#marketplace-ops',
        silencedUntil: d('2026-05-10'), silenceReason: 'Hepsiburada planlı sunucu bakımı',
      },
    ],
  });

  await prisma.deploymentMarker.createMany({
    data: [
      { service: 'api-gateway', version: 'v2.5.2', environment: 'production', description: 'GİB E-Fatura UBL-TR 1.2.1 şema güncellemesi', deployedAt: d('2026-04-25'), createdById: adminUserId },
      { service: 'backend-core', version: 'v2.6.0', environment: 'production', description: 'Performans iyileştirmeleri ve yeni otomasyon motoru', deployedAt: d('2026-05-01'), createdById: adminUserId },
    ],
  });

  await prisma.observabilityLogEntry.createMany({
    data: [
      { fingerprint: 'log-err-01', level: 'ERROR', service: 'edocument-service', message: 'GİB PK web service validation error 1163', occurredAt: d('2026-04-12T10:00:00') },
      { fingerprint: 'log-info-01', level: 'INFO', service: 'billing-cron', message: 'Aylık kurumsal abonelik faturalandırması başarıyla tamamlandı', occurredAt: d('2026-05-01T00:01:00') },
    ],
  });

  // 2. Security Findings
  await prisma.platformSecurityFinding.createMany({
    data: [
      {
        key: 'SEC-TLS-1.0-AUDIT', title: 'TLS 1.0 ve 1.1 Protokol Desteği Kapatıldı',
        category: 'NETWORK', severity: 'LOW', status: 'RESOLVED', verificationStatus: 'VERIFIED',
        owner: 'DevSecOps Ekibi', remediation: 'Yalnızca TLS 1.2 ve 1.3 şifreleme süitleri aktif tutuldu.',
        evidence: { tlsVersion: '1.3', cipher: 'TLS_AES_256_GCM_SHA384' },
      },
      {
        key: 'SEC-API-RATE-LIMIT', title: 'Webhook Endpoint Hız Sınırı Doğrulaması',
        category: 'APPLICATION', severity: 'MEDIUM', status: 'OPEN', verificationStatus: 'IN_REVIEW',
        owner: 'Güvenlik Ekibi', remediation: 'Dakikada maksimum 120 istek sınırı ve IP bazlı throttling kontrolü.',
        evidence: { currentLimit: 120, algorithm: 'sliding-window' },
      },
    ],
  });

  // 3. Platform Incident & Communication
  const incident = await prisma.platformIncident.create({
    data: {
      title: 'Trendyol Sipariş Senkronizasyon Servisi Gecikmesi',
      summary: 'Trendyol API sunucularındaki bakım nedeniyle 45 dakika boyunca sipariş çekme istekleri zaman aşımına uğradı.',
      severity: 'SEV-3', status: 'RESOLVED', owner: 'Operasyon Nöbetçisi',
      runbookUrl: 'https://wiki.axonerp.com/runbooks/marketplace-outage',
      createdById: adminUserId, resolvedAt: d('2026-05-03T15:00:00'),
      tenants: { create: [{ tenantId }] },
      timeline: {
        create: [
          { type: 'DETECTED', message: 'Webhook zaman aşımı uyarıları tetiklendi', createdById: adminUserId, createdAt: d('2026-05-03T14:15:00') },
          { type: 'MITIGATED', message: 'Kuyruk tekrar deneme mekanizması devreye alındı', createdById: adminUserId, createdAt: d('2026-05-03T14:45:00') },
          { type: 'RESOLVED', message: 'Tüm bekleyen siparişler başarıyla içeri aktarıldı', createdById: adminUserId, createdAt: d('2026-05-03T15:00:00') },
        ]
      },
      communications: {
        create: [
          {
            message: 'Trendyol entegrasyonundaki geçici gecikme giderilmiş olup siparişleriniz güncellenmiştir.',
            status: 'PUBLISHED', recipientCount: 150, requestedById: adminUserId, publishedAt: d('2026-05-03T15:05:00'),
          },
        ]
      },
    },
  });

  // 4. Disaster Recovery (Yedekleme & Tatbikat)
  await prisma.platformDisasterRecoveryPolicy.upsert({
    where: { id: 'default' },
    create: { id: 'default', targetRpoMinutes: 60, targetRtoMinutes: 240, maxReplicationLagSeconds: 180 },
    update: { targetRpoMinutes: 60, targetRtoMinutes: 240, maxReplicationLagSeconds: 180 },
  });

  const backup = await prisma.platformBackupEvidence.create({
    data: {
      providerRef: 'bak-prod-daily-20260504', status: 'VERIFIED', sizeBytes: BigInt(2450000000),
      encrypted: true, encryptionKeyRef: 'kms/prod/backup-key-01', region: 'eu-central-1',
      startedAt: d('2026-05-04T02:00:00'), completedAt: d('2026-05-04T02:18:00'), recordedById: adminUserId,
    },
  });

  await prisma.platformRestoreDrill.create({
    data: {
      backupId: backup.id, status: 'COMPLETED', environment: 'staging-recovery-drill',
      runbookUrl: 'https://wiki.axonerp.com/runbooks/dr-drill', approvalId: 'APPR-DR-2026-Q1',
      requestedById: adminUserId, startedAt: d('2026-05-04T10:00:00'), completedAt: d('2026-05-04T10:42:00'),
      actualRpoMinutes: 14, actualRtoMinutes: 42,
      notes: 'Felaket kurtarma simülasyonu başarıyla tamamlandı. RPO/RTO hedefleri sağlandı.',
    },
  });

  // 5. KVKK / Gizlilik (Privacy Operations)
  await prisma.dataSubjectRequest.create({
    data: {
      tenantId, subjectEmail: 'eski.calisan@email.com', type: 'EXPORT',
      status: 'APPROVED', scope: { modules: ['hr', 'attendance'] },
      reason: 'KVKK 11. madde uyarınca kişisel verilerin dökümü talebi',
      ticketId: 'DSR-2026-001', requestedById: adminUserId, approvedById: adminUserId,
      approvedAt: d('2026-04-20'),
    },
  });

  await prisma.privacyLegalHold.create({
    data: {
      tenantId, reason: '2025 Mali Yılı Gelir İdaresi Başkanlığı Vergi İncelemesi',
      active: true, createdById: adminUserId,
    },
  });

  // 6. Feature Rollouts
  await prisma.featureRollout.create({
    data: {
      plan: 'ENTERPRISE', featureKey: FeatureKey.CASHFLOW_FORECAST, version: 1,
      environment: 'production', stage: 'BETA', status: 'ACTIVE',
      value: 'true', isEnabled: true, rolloutPercentage: 50,
      startsAt: d('2026-05-01'), errorThresholdPct: 2.0, reason: 'Nakit Akış Tahminleme Modülü Kademeli Dağıtımı',
      createdById: adminUserId, activatedById: adminUserId, activatedAt: d('2026-05-01'),
    },
  });

  // 7. Demo Requests (Web sitesi lead akışı)
  const demoReq1 = await prisma.demoRequest.create({
    data: {
      fullName: 'Canberk Aktaş', companyName: 'Aktaş Lojistik A.Ş.',
      email: 'canberk@aktaslogistics.com', phone: '+90 532 999 0001',
      plan: 'ENTERPRISE', status: DemoRequestStatus.APPROVED,
      processedBy: 'admin@axonerp.com', processedAt: d('2026-05-02'),
      notes: 'Büyük filo ve çoklu depo yönetimi talebi var.',
    },
  });
  await prisma.demoRequestHistory.create({
    data: {
      demoRequestId: demoReq1.id,
      action: 'APPROVE',
      actorId: adminUserId,
      note: 'Satış ekibi ön görüşme yaptı, onaylandı.',
    },
  });

  await prisma.demoRequest.create({
    data: {
      fullName: 'Seda Çetinkaya', companyName: 'Çetinkaya Perakende',
      email: 'seda@cetinkaya.com', phone: '+90 532 999 0002',
      plan: 'STARTER', status: DemoRequestStatus.PENDING,
      notes: 'Tek mağaza için basit fatura ve stok takibi talebi.',
    },
  });

  // 8. Admin Ekstra Tercihleri
  await prisma.adminUiPreference.upsert({
    where: { adminId: adminUserId },
    create: { adminId: adminUserId, locale: 'tr-TR', density: 'COMFORTABLE', highContrast: false },
    update: { locale: 'tr-TR', density: 'COMFORTABLE' },
  });

  await prisma.adminInboxPreference.upsert({
    where: { adminId: adminUserId },
    create: { adminId: adminUserId, approvals: true, security: true, incidents: true, expirations: true },
    update: { approvals: true, security: true },
  });

  await prisma.adminSavedListView.create({
    data: {
      adminId: adminUserId, name: 'Aktif Kurumsal Kiracılar', resource: 'tenants',
      config: { filter: { plan: 'ENTERPRISE', status: 'ACTIVE' }, sort: 'createdAt:desc' },
    },
  });

  await prisma.adminIdempotencyRecord.create({
    data: {
      adminId: adminUserId, method: 'POST', path: '/api/admin/tenants', key: 'idem-tenant-provision-01',
      requestHash: 'hash_abc123', state: 'COMPLETED', statusCode: 201, expiresAt: d('2026-12-31'),
    },
  });

  await prisma.adminSensitiveAccessGrant.create({
    data: {
      adminId: adminUserId, tenantId, fields: ['taxNumber', 'email', 'phone', 'address'],
      purpose: 'Müşteri destek bileti TKT-2026-001 incelemesi',
      reason: 'GİB vergi kimlik numarası uyuşmazlığı doğrulaması',
      expiresAt: d('2026-05-15'),
    },
  });
}

// ─────────────────────────────────────────────
// STARTER & PROFESSIONAL PLAN DEMO DATA
// ─────────────────────────────────────────────

async function seedStarterAndProData(
  starterTenant: { id: string },
  proTenant: { id: string },
) {
  // ── STARTER DEMO TENANT ───────────────────────
  // Sade bir perakende işletmesi: 1 depo, 4 ürün, 2 cari, nakit/banka, basit satış
  const st = starterTenant.id;
  const unitSt = await prisma.unit.create({ data: { tenantId: st, name: 'Adet', code: 'AD' } });
  const kdv20St = await prisma.taxRate.create({ data: { tenantId: st, name: 'KDV %20', rate: 20 } });
  await prisma.currency.create({ data: { tenantId: st, code: 'TRY', name: 'Türk Lirası', symbol: '₺', defaultRate: 1, isBase: true } });

  const whSt = await prisma.warehouse.create({ data: { tenantId: st, name: 'Mağaza Deposu', code: 'MAG-01', address: 'Kadıköy Çarşı' } });
  const locSt = await prisma.location.create({ data: { tenantId: st, warehouseId: whSt.id, name: 'Raf 1', code: 'R1' } });

  const pSt1 = await prisma.product.create({ data: { tenantId: st, code: 'ST-001', name: 'Kablosuz Kulaklık Lite', unitId: unitSt.id, taxRateId: kdv20St.id, purchasePrice: 400, salesPrice: 799, minStockLevel: 5, averageCost: 400 } });
  const pSt2 = await prisma.product.create({ data: { tenantId: st, code: 'ST-002', name: 'Telefon Kılıfı Şeffaf', unitId: unitSt.id, taxRateId: kdv20St.id, purchasePrice: 50, salesPrice: 149, minStockLevel: 10, averageCost: 50 } });

  await prisma.stockLevel.create({ data: { tenantId: st, productId: pSt1.id, warehouseId: whSt.id, locationId: locSt.id, quantity: 25 } });
  await prisma.stockLevel.create({ data: { tenantId: st, productId: pSt2.id, warehouseId: whSt.id, locationId: locSt.id, quantity: 80 } });

  const custSt = await prisma.contact.create({ data: { tenantId: st, type: 'CUSTOMER', name: 'Bireysel Müşteri - Selim Kaya', code: 'C-ST01', city: 'İstanbul', phone: '+90 555 123 0001' } });

  const orderSt = await prisma.salesOrder.create({
    data: {
      tenantId: st, contactId: custSt.id, number: 'SIP-ST-001', date: d('2026-05-01'), status: 'DELIVERED',
      totalNet: 1498, totalTax: 299.6, totalGross: 1797.6, invoicedAmount: 1797.6,
      items: {
        create: [
          { tenantId: st, productId: pSt1.id, description: 'Kablosuz Kulaklık Lite x2', quantity: 2, unitPrice: 799, taxRate: 20, taxAmount: 319.6, lineTotal: 1917.6, delivered: 2 },
        ]
      },
    },
  });

  await prisma.invoice.create({
    data: {
      tenantId: st, contactId: custSt.id, salesOrderId: orderSt.id, type: 'SALES', status: 'PAID',
      number: 'INV-ST-001', date: d('2026-05-01'), totalNet: 1498, totalTax: 299.6, totalGross: 1797.6,
      lines: {
        create: [
          { tenantId: st, productId: pSt1.id, description: 'Kablosuz Kulaklık Lite x2', quantity: 2, unitPrice: 799, taxAmount: 319.6, lineTotal: 1917.6 },
        ]
      },
    },
  });

  // ── PROFESSIONAL DEMO TENANT ──────────────────
  // Büyüyen toptancı: 2 depo, 6 ürün, cari hesaplar, pazaryeri
  const pr = proTenant.id;
  const unitPr = await prisma.unit.create({ data: { tenantId: pr, name: 'Adet', code: 'AD' } });
  const kdv20Pr = await prisma.taxRate.create({ data: { tenantId: pr, name: 'KDV %20', rate: 20 } });
  await prisma.currency.create({ data: { tenantId: pr, code: 'TRY', name: 'Türk Lirası', symbol: '₺', defaultRate: 1, isBase: true } });
  await prisma.currency.create({ data: { tenantId: pr, code: 'USD', name: 'Amerikan Doları', symbol: '$', defaultRate: 32.5 } });

  const whPr1 = await prisma.warehouse.create({ data: { tenantId: pr, name: 'Merkez Depo', code: 'PR-WH01', address: 'İkitelli OSB' } });
  const whPr2 = await prisma.warehouse.create({ data: { tenantId: pr, name: 'Sevkiyat Deposu', code: 'PR-WH02', address: 'Hadımköy' } });
  const locPr1 = await prisma.location.create({ data: { tenantId: pr, warehouseId: whPr1.id, name: 'A-1', code: 'A1' } });
  const locPr2 = await prisma.location.create({ data: { tenantId: pr, warehouseId: whPr2.id, name: 'B-1', code: 'B1' } });

  const pPr1 = await prisma.product.create({ data: { tenantId: pr, code: 'PRO-01', name: 'Endüstriyel Barkod Okuyucu', unitId: unitPr.id, taxRateId: kdv20Pr.id, purchasePrice: 1500, salesPrice: 2400, minStockLevel: 10, averageCost: 1500 } });
  const pPr2 = await prisma.product.create({ data: { tenantId: pr, code: 'PRO-02', name: 'Termal Etiket Yazıcı', unitId: unitPr.id, taxRateId: kdv20Pr.id, purchasePrice: 2800, salesPrice: 4200, minStockLevel: 5, averageCost: 2800 } });

  await prisma.stockLevel.create({ data: { tenantId: pr, productId: pPr1.id, warehouseId: whPr1.id, locationId: locPr1.id, quantity: 30 } });
  await prisma.stockLevel.create({ data: { tenantId: pr, productId: pPr2.id, warehouseId: whPr1.id, locationId: locPr1.id, quantity: 18 } });

  const custPr = await prisma.contact.create({ data: { tenantId: pr, type: 'CUSTOMER', name: 'Marmara Dağıtım Pazarlama', code: 'C-PRO01', city: 'Kocaeli', creditLimit: 120000, paymentTermDays: 30 } });

  const orderPr = await prisma.salesOrder.create({
    data: {
      tenantId: pr, contactId: custPr.id, number: 'SIP-PRO-001', date: d('2026-04-28'), status: 'CONFIRMED',
      totalNet: 13200, totalTax: 2640, totalGross: 15840,
      items: {
        create: [
          { tenantId: pr, productId: pPr1.id, description: 'Barkod Okuyucu x3', quantity: 3, unitPrice: 2400, taxRate: 20, taxAmount: 1440, lineTotal: 8640 },
          { tenantId: pr, productId: pPr2.id, description: 'Etiket Yazıcı x2', quantity: 2, unitPrice: 4200, taxRate: 20, taxAmount: 1680, lineTotal: 10080 },
        ]
      },
    },
  });

  await prisma.deliveryNote.create({
    data: {
      tenantId: pr, number: 'DN-PRO-001', type: 'OUTBOUND', status: 'SHIPPED',
      salesOrderId: orderPr.id, contactId: custPr.id, warehouseId: whPr1.id,
      date: d('2026-04-29'), carrier: 'Sürat Kargo', trackingNumber: 'SK99887766',
      items: {
        create: [
          { tenantId: pr, productId: pPr1.id, description: 'Barkod Okuyucu x3', orderedQty: 3, deliveredQty: 3 },
        ]
      },
    },
  });

  // Trendyol Entegrasyonu (Pro Kiracı)
  const tyPr = await prisma.marketplaceIntegration.create({
    data: { tenantId: pr, channel: 'TRENDYOL', name: 'Trendyol Pro Mağaza', isActive: true, lastSyncAt: d('2026-05-04') },
  });
  await prisma.marketplaceListing.create({
    data: { tenantId: pr, integrationId: tyPr.id, productId: pPr1.id, externalId: 'TY-PRO-01', price: 2400, stock: 25, isActive: true },
  });
}

// ─────────────────────────────────────────────
// MAIN RUNNER
// ─────────────────────────────────────────────

async function runSeed() {
  console.log('\n🚀 Kapsamlı ERP Seed Verisi Yükleniyor...\n');

  // 1. Platform Admin
  const platformAdmin = await prisma.adminUser.upsert({
    where: { email: 'admin@axonerp.com' },
    create: { email: 'admin@axonerp.com', name: 'Platform Admin', password: await hash('admin1234'), isActive: true },
    update: { password: await hash('admin1234') },
  });
  const superAdminRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  await prisma.adminUserRole.upsert({
    where: { adminUserId_adminRoleId: { adminUserId: platformAdmin.id, adminRoleId: superAdminRole.id } },
    create: { adminUserId: platformAdmin.id, adminRoleId: superAdminRole.id },
    update: {},
  });
  console.log('  ✓ 1. Platform Admin: admin@axonerp.com / admin1234');

  // 2. Plan Features
  await seedPlanFeatures();
  console.log('  ✓ 2. Plan Özellikleri (Starter / Professional / Enterprise)');

  // 3. Tenants & Users
  const { tenant, users, planAccounts } = await seedTenant();
  console.log(`  ✓ 3. Ana Kiracı: ${tenant.companyName} (Enterprise)`);
  console.log(`       Kullanıcılar: ${users.map(u => u.email).join(', ')}`);
  console.log(`       Plan Demo Hesapları: ${planAccounts.map(({ user }) => user.email).join(', ')}`);

  // 4. Master Data
  const master = await seedMasterData(tenant.id);
  console.log('  ✓ 4. Ana Veriler (Birimler, Kategoriler, KDV + Tevkifat, Kurlar, TDHP)');

  // 5. Warehouses & Locations
  const { warehouse, warehouse2, locations } = await seedWarehouses(tenant.id);
  console.log('  ✓ 5. Depolar ve Lokasyonlar (Ana Depo, Üretim Deposu)');

  // 6. Products & Stock Levels
  const products = await seedProducts(tenant.id, master, warehouse, warehouse2, locations);
  console.log(`  ✓ 6. Ürün Kataloğu & Stok Seviyeleri (${products.length} ürün)`);

  // 7. Contacts
  const contacts = await seedContacts(tenant.id);
  console.log(`  ✓ 7. Cari Hesaplar (${contacts.length} müşteri & tedarikçi)`);

  // 8. Sales
  const sales = await seedSales(tenant.id, contacts, products, master, warehouse);
  console.log(`  ✓ 8. Satış & Finans: ${sales.invoices.length} fatura, ${sales.orders.length} sipariş, ${sales.payments.length} ödeme`);

  // 9. E-Documents (E-Fatura, E-Arşiv, E-İrsaliye)
  await seedEDocuments(tenant.id, sales.invoices, sales.deliveryNotes);
  console.log('  ✓ 9. E-Dönüşüm / E-Belgeler (Onaylı E-Fatura, E-Arşiv, Hatalı Belge & E-İrsaliye)');

  // 10. Collection Reminders
  await seedCollectionReminders(tenant.id, contacts, sales.invoices);
  console.log('  ✓ 10. Tahsilat Hatırlatmaları & Borç Takibi');

  // 11. Purchasing
  const purchasing = await seedPurchasing(tenant.id, contacts, products, master, warehouse);
  console.log('  ✓ 11. Satın Alma (Talepler, Siparişler, İrsaliyeli Alış Faturası)');

  // 12. Accounting & Ledgers
  await seedAccounting(tenant.id, master.accounts, sales.invoices, purchasing.purchInv);
  console.log('  ✓ 12. Genel Muhasebe (Mahsup Fişleri, Banka Mutabakatı, Çek/Senet)');

  // 13. HR & Payroll
  await seedHR(tenant.id);
  console.log('  ✓ 13. İnsan Kaynakları & Bordro (Personel, İzin Talepleri, Puantaj, Maaş Bordroları)');

  // 14. Production & Work Centers
  await seedProduction(tenant.id, products, warehouse2);
  console.log('  ✓ 14. Üretim Yönetimi (İş Merkezleri, Kapasite Planı, BOM, İş Emirleri & Maliyet Detayları)');

  // 15. Service Management
  const service = await seedService(tenant.id, contacts, products);
  console.log('  ✓ 15. Satış Sonrası Servis & Müşteri Varlıkları');

  // 16. Multi-Marketplace (Trendyol, Hepsiburada, Amazon)
  await seedMarketplace(tenant.id, products);
  console.log('  ✓ 16. Çoklu Pazaryeri Entegrasyonu (Trendyol, Hepsiburada, Amazon)');

  // 17. Roles & Approval Workflows
  await seedRolesAndApprovals(tenant.id, users, purchasing);
  console.log('  ✓ 17. Roller, Yetkiler & Çok Adımlı Onay İstekleri');

  // 18. Collaboration & Workflow Center
  await seedCollaborationAndWorkflow(tenant.id, users, sales, service);
  console.log('  ✓ 18. Kayıt Yorumları, @Mention, Görevler, E-Postalar & Bildirimler');

  // 19. Automation Engine
  await seedAutomations(tenant.id);
  console.log('  ✓ 19. Otomasyon Motoru (Tetikleyiciler, Kurallar & Çalıştırma Kayıtları)');

  // 20. Attachments (Document Center)
  await seedAttachments(tenant.id, sales, products, service, users[0].id);
  console.log('  ✓ 20. Dosya ve Belge Yönetimi (Fatura PDF, Şartname, Servis Fotoğrafları)');

  // 21. Saved Views & Domain Events
  await seedSavedViewsAndOutbox(tenant.id, users[0].id, '', sales);
  console.log('  ✓ 21. Kayıtlı Tablo Görünümleri & Domain Event Outbox Kuyruğu');

  // 22. SaaS Subscriptions & Billing
  await seedBilling(tenant.id, planAccounts[0].tenant.id, planAccounts[1].tenant.id, platformAdmin.id);
  console.log('  ✓ 22. SaaS Abonelikleri, Faturalar, Kuponlar & Özel Fiyat Talepleri');

  // 23. Support Tickets (Tenant <-> Platform)
  await seedSupportTickets(tenant.id, users[0].id, platformAdmin.id);
  console.log('  ✓ 23. Platform Destek Biletleri & İki Yönlü Mesajlaşma');

  // 24. Enterprise Governance
  await seedEnterpriseGovernance(tenant.id, platformAdmin.id, users[1].id);
  console.log('  ✓ 24. Kurumsal Yönetişim (API Anahtarları, Davetiyeler, Feature Override, Audit Log, AI Logları)');

  // 25. Platform Observability & Security
  await seedPlatformHealth(tenant.id, platformAdmin.id);
  console.log('  ✓ 25. Gözlemlenebilirlik (SLO, Metrikler, Alarmlar), Güvenlik, Olay Kaydı & Felaket Kurtarma');

  // 26. Starter & Professional Demo Data
  await seedStarterAndProData(planAccounts[0].tenant, planAccounts[1].tenant);
  console.log('  ✓ 26. Starter ve Professional Demo Kiracıları İçin Özel Veriler');

  console.log('\n===========================================================');
  console.log('🎉 DETAYLI SEED TAMAMLANDI! TÜM MODÜLLER VE ÖZELLİKLER AKTİF!');
  console.log('===========================================================\n');
  console.log('  📧 Enterprise Demo Kullanıcıları:');
  console.log('     admin@axondemo.com    / demo1234  (Yönetici - Tüm Modüller)');
  console.log('     satis@axondemo.com    / demo1234  (Satış & Pazarlama)');
  console.log('     muhasebe@axondemo.com / demo1234  (Muhasebe & Finans)');
  console.log('     depo@axondemo.com     / demo1234  (Depo & Lojistik)\n');
  console.log('  📧 Plan Karşılaştırma Hesapları:');
  console.log('     starter@axondemo.com  / demo1234  (Starter Plan - Sade Perakende)');
  console.log('     pro@axondemo.com      / demo1234  (Professional Plan - Toptan Ticaret)\n');
  console.log('  🔑 Platform Admin Paneli:');
  console.log('     admin@axonerp.com     / admin1234\n');
}

runSeed()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
