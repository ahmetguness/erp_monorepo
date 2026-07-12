import { FeatureKey, FeatureType, Plan, PrismaClient } from '@prisma/client';
import { PLAN_FEATURE_ROWS, type PlanFeatureRow } from '@repo/types/plans';
import bcrypt from 'bcryptjs';
import { modulesForPlan } from '../src/utils/tenant-modules';

const prisma = new PrismaClient();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function d(dateStr: string): Date {
  return new Date(dateStr);
}

async function hash(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main() {
  console.log('\nðŸŒ± Seed başlıyor...\n');

  // â”€â”€ 1. Admin User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await prisma.adminUser.upsert({
    where: { email: 'admin@axonerp.com' },
    create: {
      email: 'admin@axonerp.com',
      name: 'Platform Admin',
      password: await hash('admin1234'),
      isActive: true,
    },
    update: { password: await hash('admin1234') },
  });
  console.log('  âœ“ Admin: admin@axonerp.com / admin1234');

  // â”€â”€ 2. Plan Features â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedPlanFeatures();
  console.log('  âœ“ Plan features (Starter / Professional / Enterprise)');

  // â”€â”€ 3. Demo Tenant (Enterprise) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { tenant, users, planAccounts } = await seedTenant();
  console.log(`  âœ“ Tenant: ${tenant.companyName} (Enterprise)`);
  console.log(`  âœ“ Kullanıcılar: ${users.map(u => u.email).join(', ')}`);
  console.log(`  âœ“ Plan demo hesapları: ${planAccounts.map(({ user }) => user.email).join(', ')}`);

  // â”€â”€ 4. Master Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const master = await seedMasterData(tenant.id);
  console.log('  âœ“ Master data (birim, kategori, KDV, döviz, hesap planı)');

  // â”€â”€ 5. Warehouse & Locations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { warehouse, warehouse2, locations } = await seedWarehouses(tenant.id);
  console.log('  âœ“ Depolar ve lokasyonlar');

  // â”€â”€ 6. Products & Stock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const products = await seedProducts(tenant.id, master, warehouse, warehouse2, locations);
  console.log(`  âœ“ ${products.length} ürün ve stok seviyeleri`);

  // â”€â”€ 7. Contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const contacts = await seedContacts(tenant.id);
  console.log(`  âœ“ ${contacts.length} cari hesap`);

  // â”€â”€ 8. Sales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { invoices, payments } = await seedSales(tenant.id, contacts, products, master, warehouse);
  console.log(`  âœ“ Satış: ${invoices.length} fatura, ${payments.length} ödeme`);

  // â”€â”€ 9. Purchasing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedPurchasing(tenant.id, contacts, products, master, warehouse);
  console.log('  âœ“ Satın alma: talepler ve siparişler');

  // â”€â”€ 10. Accounting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedAccounting(tenant.id, master.accounts, invoices);
  console.log('  âœ“ Muhasebe: yevmiye fişleri, mali dönem');

  // â”€â”€ 11. HR & Payroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedHR(tenant.id);
  console.log('  âœ“ İK: personel, izin, puantaj, bordro');

  // â”€â”€ 12. Production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedProduction(tenant.id, products, master, warehouse, warehouse2);
  console.log('  âœ“ Üretim: iş merkezleri, BOM, iş emirleri');

  // â”€â”€ 13. Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedService(tenant.id, contacts, products);
  console.log('  âœ“ Servis: müşteri varlıkları, servis talepleri');

  // â”€â”€ 14. Marketplace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedMarketplace(tenant.id, products);
  console.log('  âœ“ Pazaryeri: Trendyol entegrasyonu');

  // â”€â”€ 15. Roles & Permissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedRoles(tenant.id, users);
  console.log('  âœ“ Roller ve izinler');

  // â”€â”€ 16. Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedNotifications(tenant.id, users[0].id);
  console.log('  âœ“ Bildirimler');

  // â”€â”€ 17. Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await seedSettings(tenant.id);
  console.log('  âœ“ Tenant ayarları');

  console.log('\nâœ… Seed tamamlandı!\n');
  console.log('  Giriş: admin@axondemo.com / demo1234');
  console.log('  Admin: admin@axonerp.com / admin1234\n');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PLAN FEATURES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedPlanFeatures() {
  const features = PLAN_FEATURE_ROWS.map(toPrismaPlanFeature);

  for (const f of features) {
    await prisma.planFeature.upsert({
      where: { plan_key: { plan: f.plan, key: f.key } },
      create: f,
      update: { value: f.value, type: f.type, featureKey: f.featureKey },
    });
  }
}

function toPrismaPlanFeature(feature: PlanFeatureRow) {
  return {
    plan: Plan[feature.plan],
    key: feature.key,
    featureKey: FeatureKey[feature.featureKey],
    value: feature.value,
    type: FeatureType[feature.type],
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
// TENANT & USERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedTenant() {
  // Önce mevcut tenant'ı temizle (idempotent seed)
  for (const slug of ['axon-demo', 'axon-starter-demo', 'axon-pro-demo']) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      // Cascade delete ile tüm bağlı verileri sil
      await prisma.tenant.delete({ where: { id: existing.id } });
    }
  }
  // Tüm kullanıcıları da temizle (tenant dışı)
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'admin@axondemo.com',
          'satis@axondemo.com',
          'muhasebe@axondemo.com',
          'depo@axondemo.com',
          'starter@axondemo.com',
          'pro@axondemo.com',
        ],
      },
    },
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MASTER DATA
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const catTelefon    = await prisma.category.create({ data: { tenantId, name: 'Telefon', parentId: catElektronik.id } });
  const catAksesuar   = await prisma.category.create({ data: { tenantId, name: 'Aksesuar', parentId: catElektronik.id } });
  const catOfis       = await prisma.category.create({ data: { tenantId, name: 'Ofis Malzemeleri' } });
  const catHammadde   = await prisma.category.create({ data: { tenantId, name: 'Hammadde' } });
  const catYarimMamul = await prisma.category.create({ data: { tenantId, name: 'Yarı Mamul' } });

  // Tax Rates
  const [kdv0, kdv10, kdv20] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %0',  rate: 0  } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %10', rate: 10 } }),
    prisma.taxRate.create({ data: { tenantId, name: 'KDV %20', rate: 20 } }),
  ]);

  // Currencies
  await Promise.all([
    prisma.currency.create({ data: { tenantId, code: 'TRY', name: 'Türk Lirası',     symbol: 'â‚º', defaultRate: 1,    isBase: true } }),
    prisma.currency.create({ data: { tenantId, code: 'USD', name: 'Amerikan Doları', symbol: '$', defaultRate: 32.5 } }),
    prisma.currency.create({ data: { tenantId, code: 'EUR', name: 'Euro',            symbol: 'â‚¬', defaultRate: 35.2 } }),
    prisma.currency.create({ data: { tenantId, code: 'GBP', name: 'İngiliz Sterlini',symbol: 'Â£', defaultRate: 41.0 } }),
  ]);

  // Currency Rates (son 3 gün)
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

  // Ledger Accounts (Hesap Planı)
  const accounts = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId, code: '100', name: 'Kasa',                          accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '102', name: 'Bankalar',                      accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '120', name: 'Alıcılar',                      accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '153', name: 'Ticari Mallar',                 accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '191', name: 'İndirilecek KDV',               accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '320', name: 'Satıcılar',                     accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '391', name: 'Hesaplanan KDV',                accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '500', name: 'Sermaye',                       accountType: 'EQUITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '600', name: 'Yurt İçi Satışlar',             accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '601', name: 'Yurt Dışı Satışlar',            accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '621', name: 'Satılan Ticari Mallar Maliyeti',accountType: 'EXPENSE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '760', name: 'Pazarlama Giderleri',           accountType: 'EXPENSE' } }),
    prisma.ledgerAccount.create({ data: { tenantId, code: '770', name: 'Genel Yönetim Giderleri',       accountType: 'EXPENSE' } }),
  ]);

  // Fiscal Period
  const fiscalPeriod = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Yılı', startDate: d('2026-01-01'), endDate: d('2026-12-31'), status: 'OPEN' },
  });

  // Number Sequences
  const seqModules = [
    { module: 'invoice',          prefix: 'INV-' },
    { module: 'sales_quote',      prefix: 'TKL-' },
    { module: 'sales_order',      prefix: 'SIP-' },
    { module: 'purchase_request', prefix: 'PR-'  },
    { module: 'purchase_order',   prefix: 'PO-'  },
    { module: 'journal',          prefix: 'JE-'  },
    { module: 'stock_count',      prefix: 'SC-'  },
    { module: 'delivery_note',    prefix: 'DN-'  },
    { module: 'work_order',       prefix: 'WO-'  },
    { module: 'service_request',  prefix: 'SR-'  },
  ];
  for (const s of seqModules) {
    await prisma.numberSequence.create({ data: { tenantId, module: s.module, prefix: s.prefix, lastNum: 10, padding: 6 } });
  }

  return { unitAdet, unitKg, unitLt, unitMt, unitKutu, unitPaket, catBilgisayar, catTelefon, catAksesuar, catOfis, catHammadde, catYarimMamul, catElektronik, kdv0, kdv10, kdv20, accounts, fiscalPeriod };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// WAREHOUSES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedWarehouses(tenantId: string) {
  const warehouse = await prisma.warehouse.create({
    data: { tenantId, name: 'Ana Depo', code: 'WH01', address: 'Dudullu OSB, İstanbul' },
  });
  const warehouse2 = await prisma.warehouse.create({
    data: { tenantId, name: 'Üretim Deposu', code: 'WH02', address: 'Dudullu OSB Blok B, İstanbul' },
  });

  const locations = await Promise.all([
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id,  name: 'Raf A-1', code: 'A-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id,  name: 'Raf A-2', code: 'A-2' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id,  name: 'Raf B-1', code: 'B-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse.id,  name: 'Raf B-2', code: 'B-2' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse2.id, name: 'Üretim Alanı', code: 'P-1' } }),
    prisma.location.create({ data: { tenantId, warehouseId: warehouse2.id, name: 'Hammadde Rafı', code: 'P-2' } }),
  ]);

  return { warehouse, warehouse2, locations };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PRODUCTS & STOCK
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedProducts(
  tenantId: string,
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
  warehouse2: { id: string },
  locations: { id: string }[],
) {
  const { unitAdet, unitKg, catBilgisayar, catTelefon, catAksesuar, catOfis, catHammadde, catYarimMamul, kdv10, kdv20 } = master;

  const productDefs = [
    { code: 'P001', name: 'Laptop Pro 15"',           unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 18000, sellPrice: 24999, minStock: 5,  avgCost: 18000, qty: 12, locIdx: 0 },
    { code: 'P002', name: 'Mekanik Klavye RGB',        unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 800,   sellPrice: 1299,  minStock: 10, avgCost: 800,   qty: 45, locIdx: 0 },
    { code: 'P003', name: 'Kablosuz Mouse Pro',        unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 350,   sellPrice: 599,   minStock: 15, avgCost: 350,   qty: 38, locIdx: 1 },
    { code: 'P004', name: 'Akıllı Telefon X12',        unitId: unitAdet.id, catId: catTelefon.id,    taxId: kdv20.id, buyPrice: 12000, sellPrice: 16999, minStock: 8,  avgCost: 12000, qty: 7,  locIdx: 1 },
    { code: 'P005', name: 'USB-C Hub 7 Port',          unitId: unitAdet.id, catId: catAksesuar.id,   taxId: kdv20.id, buyPrice: 280,   sellPrice: 499,   minStock: 20, avgCost: 280,   qty: 62, locIdx: 2 },
    { code: 'P006', name: 'A4 Fotokopi Kağıdı 500 yp', unitId: unitAdet.id, catId: catOfis.id,       taxId: kdv10.id, buyPrice: 85,    sellPrice: 120,   minStock: 50, avgCost: 85,    qty: 3,  locIdx: 2 },
    { code: 'P007', name: 'Tükenmez Kalem Seti 12li',  unitId: unitAdet.id, catId: catOfis.id,       taxId: kdv10.id, buyPrice: 45,    sellPrice: 79,    minStock: 30, avgCost: 45,    qty: 28, locIdx: 0 },
    { code: 'P008', name: 'Monitor 27" 4K IPS',        unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 7500,  sellPrice: 10999, minStock: 3,  avgCost: 7500,  qty: 2,  locIdx: 1 },
    { code: 'P009', name: 'Webcam 4K Otofokus',        unitId: unitAdet.id, catId: catAksesuar.id,   taxId: kdv20.id, buyPrice: 1200,  sellPrice: 1999,  minStock: 10, avgCost: 1200,  qty: 15, locIdx: 3 },
    { code: 'P010', name: 'SSD 1TB NVMe',              unitId: unitAdet.id, catId: catBilgisayar.id, taxId: kdv20.id, buyPrice: 1800,  sellPrice: 2799,  minStock: 12, avgCost: 1800,  qty: 22, locIdx: 3 },
    // Hammadde / Yarı Mamul (üretim için)
    { code: 'HM001', name: 'Alüminyum Profil 1m',      unitId: unitKg.id,   catId: catHammadde.id,   taxId: kdv20.id, buyPrice: 45,    sellPrice: 0,     minStock: 100, avgCost: 45,   qty: 250, locIdx: 4 },
    { code: 'HM002', name: 'Plastik Granül',            unitId: unitKg.id,   catId: catHammadde.id,   taxId: kdv20.id, buyPrice: 28,    sellPrice: 0,     minStock: 200, avgCost: 28,   qty: 480, locIdx: 5 },
    { code: 'YM001', name: 'Laptop Kasası (Yarı Mamul)',unitId: unitAdet.id, catId: catYarimMamul.id, taxId: kdv20.id, buyPrice: 850,   sellPrice: 0,     minStock: 20,  avgCost: 850,  qty: 35,  locIdx: 4 },
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
    const locationId  = locations[p.locIdx]?.id ?? '';

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONTACTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedContacts(tenantId: string) {
  return Promise.all([
    // Müşteriler
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Teknoloji Çözümleri Ltd.', code: 'C001', taxNumber: '9876543210', taxOffice: 'Şişli',    email: 'satin@teknolojicozmler.com', phone: '+90 212 444 0001', city: 'İstanbul', creditLimit: 150000, paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Dijital Medya A.Ş.',       code: 'C002', taxNumber: '1122334455', taxOffice: 'Beşiktaş', email: 'muhasebe@dijitalmedya.com',  phone: '+90 212 444 0002', city: 'İstanbul', creditLimit: 75000,  paymentTermDays: 15 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Mavi Yazılım Koop.',       code: 'C003', taxNumber: '5544332211', taxOffice: 'Ankara',   email: 'finans@maviyazilim.com',     phone: '+90 312 444 0003', city: 'Ankara',   creditLimit: 50000,  paymentTermDays: 45 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Yıldız Holding A.Ş.',     code: 'C004', taxNumber: '3344556677', taxOffice: 'Levent',   email: 'it@yildizholding.com',       phone: '+90 212 444 0004', city: 'İstanbul', creditLimit: 500000, paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId, type: 'CUSTOMER', name: 'Ege Üniversitesi',         code: 'C005', taxNumber: '7788990011', taxOffice: 'Bornova',  email: 'satin@ege.edu.tr',           phone: '+90 232 444 0005', city: 'İzmir',    creditLimit: 200000, paymentTermDays: 90 } }),
    // Tedarikçiler
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'Global Elektronik Dağıtım',code: 'S001', taxNumber: '6677889900', taxOffice: 'Ümraniye', email: 'satis@globalelektronik.com', phone: '+90 216 555 0010', city: 'İstanbul', paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'Ofis Dünyası Toptan',      code: 'S002', taxNumber: '1029384756', taxOffice: 'Bağcılar', email: 'siparis@ofisdunyasi.com',    phone: '+90 212 555 0020', city: 'İstanbul', paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId, type: 'SUPPLIER', name: 'TechParts İthalat',        code: 'S003', taxNumber: '2233445566', taxOffice: 'Esenyurt', email: 'import@techparts.com',       phone: '+90 212 555 0030', city: 'İstanbul', paymentTermDays: 45 } }),
    // Hem müşteri hem tedarikçi
    prisma.contact.create({ data: { tenantId, type: 'BOTH',     name: 'İnovasyon Teknoloji',      code: 'B001', taxNumber: '9988776655', taxOffice: 'Maslak',   email: 'info@inovasyon.tech',        phone: '+90 212 555 0040', city: 'İstanbul', creditLimit: 100000, paymentTermDays: 30 } }),
  ]);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SALES (Quotes, Orders, Invoices, Payments, AccountEntries)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedSales(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  products: { id: string }[],
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
) {
  const { kdv20, kdv10 } = master;
  const [c1, c2, c3, c4, c5] = contacts;

  // â”€â”€ Sales Quotes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const quote1 = await prisma.salesQuote.create({
    data: {
      tenantId, contactId: c1.id, number: 'TKL-000001',
      date: d('2026-03-15'), validUntil: d('2026-04-15'), status: 'ACCEPTED',
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15"',    quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8,  lineTotal: 29998.8, sortOrder: 0 },
        { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599,   discount: 5, taxRate: 20, taxAmount: 114.24,  lineTotal: 1251.24, sortOrder: 1 },
      ]},
    },
  });

  await prisma.salesQuote.create({
    data: {
      tenantId, contactId: c4.id, number: 'TKL-000002',
      date: d('2026-04-01'), validUntil: d('2026-05-01'), status: 'SENT',
      totalNet: 87992, totalTax: 17598.4, totalGross: 105590.4,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x4',  quantity: 4, unitPrice: 24999, discount: 5, taxRate: 20, taxAmount: 19199.04, lineTotal: 114994.24, sortOrder: 0 },
        { tenantId, productId: products[7].id, description: 'Monitor 27" 4K x4',  quantity: 4, unitPrice: 10999, discount: 5, taxRate: 20, taxAmount: 8399.24,  lineTotal: 50395.24,  sortOrder: 1 },
      ]},
    },
  });

  // â”€â”€ Sales Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const order1 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c1.id, quoteId: quote1.id, number: 'SIP-000001',
      date: d('2026-03-20'), dueDate: d('2026-04-20'), status: 'DELIVERED',
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4, invoicedAmount: 31556.4,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15"',    quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8,  lineTotal: 29998.8, delivered: 1, sortOrder: 0 },
        { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599,   discount: 5, taxRate: 20, taxAmount: 114.24,  lineTotal: 1251.24, delivered: 2, sortOrder: 1 },
      ]},
    },
  });
  await prisma.salesOrderHistory.create({ data: { tenantId, orderId: order1.id, toStatus: 'DRAFT',     notes: 'Sipariş oluşturuldu' } });
  await prisma.salesOrderHistory.create({ data: { tenantId, orderId: order1.id, fromStatus: 'DRAFT', toStatus: 'CONFIRMED',  notes: 'Onaylandı' } });
  await prisma.salesOrderHistory.create({ data: { tenantId, orderId: order1.id, fromStatus: 'CONFIRMED', toStatus: 'DELIVERED', notes: 'Teslim edildi' } });

  const order2 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c2.id, number: 'SIP-000002',
      date: d('2026-03-25'), dueDate: d('2026-04-10'), status: 'CONFIRMED',
      totalNet: 6495, totalTax: 1299, totalGross: 7794,
      items: { create: [
        { tenantId, productId: products[1].id, description: 'Mekanik Klavye RGB x5', quantity: 5, unitPrice: 1299, discount: 0, taxRate: 20, taxAmount: 1299, lineTotal: 7794, sortOrder: 0 },
      ]},
    },
  });
  await prisma.salesOrderHistory.create({ data: { tenantId, orderId: order2.id, toStatus: 'DRAFT' } });
  await prisma.salesOrderHistory.create({ data: { tenantId, orderId: order2.id, fromStatus: 'DRAFT', toStatus: 'CONFIRMED' } });

  const order3 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c3.id, number: 'SIP-000003',
      date: d('2026-04-05'), dueDate: d('2026-05-05'), status: 'PARTIALLY_DELIVERED',
      totalNet: 4990, totalTax: 998, totalGross: 5988,
      items: { create: [
        { tenantId, productId: products[4].id, description: 'USB-C Hub 7 Port x10', quantity: 10, unitPrice: 499, discount: 0, taxRate: 20, taxAmount: 998, lineTotal: 5988, delivered: 5, sortOrder: 0 },
      ]},
    },
  });

  const order4 = await prisma.salesOrder.create({
    data: {
      tenantId, contactId: c5.id, number: 'SIP-000004',
      date: d('2026-04-15'), dueDate: d('2026-07-15'), status: 'DRAFT',
      totalNet: 109990, totalTax: 21998, totalGross: 131988,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x4',  quantity: 4, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 19999.2, lineTotal: 119995.2, sortOrder: 0 },
        { tenantId, productId: products[8].id, description: 'Webcam 4K x5',       quantity: 5, unitPrice: 1999,  discount: 0, taxRate: 20, taxAmount: 1999,    lineTotal: 11994,    sortOrder: 1 },
      ]},
    },
  });

  // â”€â”€ Delivery Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dn1 = await prisma.deliveryNote.create({
    data: {
      tenantId, number: 'DN-000001', type: 'OUTBOUND', status: 'DELIVERED',
      salesOrderId: order1.id, contactId: c1.id, warehouseId: warehouse.id,
      date: d('2026-03-22'), shippedAt: d('2026-03-22'), deliveredAt: d('2026-03-23'),
      carrier: 'Yurtiçi Kargo', trackingNumber: 'YK123456789',
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15"',    orderedQty: 1, deliveredQty: 1, sortOrder: 0 },
        { tenantId, productId: products[2].id, description: 'Kablosuz Mouse Pro', orderedQty: 2, deliveredQty: 2, sortOrder: 1 },
      ]},
    },
  });

  await prisma.deliveryNote.create({
    data: {
      tenantId, number: 'DN-000002', type: 'OUTBOUND', status: 'SHIPPED',
      salesOrderId: order3.id, contactId: c3.id, warehouseId: warehouse.id,
      date: d('2026-04-08'), shippedAt: d('2026-04-08'),
      carrier: 'MNG Kargo', trackingNumber: 'MNG987654321',
      items: { create: [
        { tenantId, productId: products[4].id, description: 'USB-C Hub 7 Port x5', orderedQty: 5, deliveredQty: 5, sortOrder: 0 },
      ]},
    },
  });

  // â”€â”€ Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c1.id, salesOrderId: order1.id,
      type: 'SALES', status: 'PAID', number: 'INV-000001',
      date: d('2026-03-22'), dueDate: d('2026-04-22'),
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      lines: { create: [
        { tenantId, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15"',    quantity: 1, unitPrice: 24999, discount: 0, taxAmount: 4999.8,  lineTotal: 29998.8, sortOrder: 0 },
        { tenantId, productId: products[2].id, taxRateId: kdv20.id, description: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599,   discount: 5, taxAmount: 114.24,  lineTotal: 1251.24, sortOrder: 1 },
      ]},
    },
  });
  await prisma.invoiceHistory.create({ data: { tenantId, invoiceId: inv1.id, toStatus: 'DRAFT' } });
  await prisma.invoiceHistory.create({ data: { tenantId, invoiceId: inv1.id, fromStatus: 'DRAFT', toStatus: 'SENT' } });
  await prisma.invoiceHistory.create({ data: { tenantId, invoiceId: inv1.id, fromStatus: 'SENT',  toStatus: 'PAID', notes: 'EFT ile ödendi' } });

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c2.id,
      type: 'SALES', status: 'SENT', number: 'INV-000002',
      date: d('2026-03-28'), dueDate: d('2026-04-12'),
      totalNet: 16999, totalTax: 3399.8, totalGross: 20398.8,
      lines: { create: [
        { tenantId, productId: products[3].id, taxRateId: kdv20.id, description: 'Akıllı Telefon X12', quantity: 1, unitPrice: 16999, discount: 0, taxAmount: 3399.8, lineTotal: 20398.8, sortOrder: 0 },
      ]},
    },
  });
  await prisma.invoiceHistory.create({ data: { tenantId, invoiceId: inv2.id, toStatus: 'DRAFT' } });
  await prisma.invoiceHistory.create({ data: { tenantId, invoiceId: inv2.id, fromStatus: 'DRAFT', toStatus: 'SENT' } });

  const inv3 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c3.id,
      type: 'SALES', status: 'OVERDUE', number: 'INV-000003',
      date: d('2026-02-15'), dueDate: d('2026-03-01'),
      totalNet: 4990, totalTax: 998, totalGross: 5988,
      lines: { create: [
        { tenantId, productId: products[4].id, taxRateId: kdv20.id, description: 'USB-C Hub 7 Port x10', quantity: 10, unitPrice: 499, discount: 0, taxAmount: 998, lineTotal: 5988, sortOrder: 0 },
      ]},
    },
  });

  const inv4 = await prisma.invoice.create({
    data: {
      tenantId, contactId: c4.id,
      type: 'SALES', status: 'DRAFT', number: 'INV-000004',
      date: d('2026-04-20'), dueDate: d('2026-06-20'),
      totalNet: 43996, totalTax: 8799.2, totalGross: 52795.2,
      lines: { create: [
        { tenantId, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15" x2',  quantity: 2, unitPrice: 24999, discount: 5, taxAmount: 4749.81, lineTotal: 47498.1, sortOrder: 0 },
        { tenantId, productId: products[9].id, taxRateId: kdv20.id, description: 'SSD 1TB NVMe x2',    quantity: 2, unitPrice: 2799,  discount: 0, taxAmount: 1119.6,  lineTotal: 6717.6,  sortOrder: 1 },
      ]},
    },
  });

  // â”€â”€ Bank & Cash Accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId, name: 'Garanti Vadesiz TRY', bankName: 'Garanti BBVA', accountNumber: '1234567', iban: 'TR12 0006 2000 1234 5678 9012 34', currencyCode: 'TRY' },
  });
  const bankAccountUSD = await prisma.bankAccount.create({
    data: { tenantId, name: 'Garanti USD Hesabı', bankName: 'Garanti BBVA', accountNumber: '7654321', iban: 'TR98 0006 2000 7654 3210 9876 54', currencyCode: 'USD' },
  });
  await prisma.cashAccount.create({ data: { tenantId, name: 'Ana Kasa TRY', currencyCode: 'TRY' } });
  await prisma.cashAccount.create({ data: { tenantId, name: 'Döviz Kasası USD', currencyCode: 'USD' } });

  // â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pay1 = await prisma.payment.create({
    data: { tenantId, contactId: c1.id, bankAccountId: bankAccount.id, date: d('2026-03-25'), amount: 31556.4, method: 'BANK_TRANSFER', reference: 'EFT-2026-001', status: 'COMPLETED', notes: 'INV-000001 ödemesi' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId, paymentId: pay1.id, invoiceId: inv1.id, amount: 31556.4 } });

  const pay2 = await prisma.payment.create({
    data: { tenantId, contactId: c2.id, bankAccountId: bankAccount.id, date: d('2026-04-10'), amount: 10000, method: 'BANK_TRANSFER', reference: 'EFT-2026-003', status: 'COMPLETED', notes: 'INV-000002 kısmi ödeme' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId, paymentId: pay2.id, invoiceId: inv2.id, amount: 10000 } });

  // â”€â”€ Account Entries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await prisma.accountEntry.createMany({
    data: [
      { tenantId, contactId: c1.id, date: d('2026-03-22'), debit: 31556.4, credit: 0,       balance: 31556.4, description: 'INV-000001 satış faturası', refType: 'INVOICE', refId: inv1.id },
      { tenantId, contactId: c1.id, date: d('2026-03-25'), debit: 0,       credit: 31556.4, balance: 0,       description: 'EFT-2026-001 ödeme',        refType: 'PAYMENT', refId: pay1.id },
      { tenantId, contactId: c2.id, date: d('2026-03-28'), debit: 20398.8, credit: 0,       balance: 20398.8, description: 'INV-000002 satış faturası', refType: 'INVOICE', refId: inv2.id },
      { tenantId, contactId: c2.id, date: d('2026-04-10'), debit: 0,       credit: 10000,   balance: 10398.8, description: 'EFT-2026-003 kısmi ödeme',  refType: 'PAYMENT', refId: pay2.id },
      { tenantId, contactId: c3.id, date: d('2026-02-15'), debit: 5988,    credit: 0,       balance: 5988,    description: 'INV-000003 satış faturası (gecikmiş)', refType: 'INVOICE', refId: inv3.id },
    ],
  });

  return { invoices: [inv1, inv2, inv3, inv4], payments: [pay1, pay2], bankAccount, bankAccountUSD };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PURCHASING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // Purchase Request
  const pr1 = await prisma.purchaseRequest.create({
    data: {
      tenantId, number: 'PR-000001', date: d('2026-04-01'), status: 'APPROVED',
      approvedAt: d('2026-04-02'), totalEstimated: 54000,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000 },
        { tenantId, productId: products[7].id, description: 'Monitor 27" 4K x2', quantity: 2, unitPrice: 7500  },
      ]},
    },
  });

  await prisma.purchaseRequest.create({
    data: {
      tenantId, number: 'PR-000002', date: d('2026-04-10'), status: 'PENDING_APPROVAL',
      totalEstimated: 8500,
      items: { create: [
        { tenantId, productId: products[5].id, description: 'A4 Kağıt x100 paket', quantity: 100, unitPrice: 85 },
      ]},
    },
  });

  // Purchase Order
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId, contactId: supplier1.id, number: 'PO-000001',
      date: d('2026-04-03'), dueDate: d('2026-06-03'), status: 'RECEIVED',
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000, discount: 0, taxRate: 20, taxAmount: 10800, lineTotal: 64800, received: 3, sortOrder: 0 },
      ]},
    },
  });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po1.id, toStatus: 'DRAFT' } });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po1.id, fromStatus: 'DRAFT',    toStatus: 'SENT' } });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po1.id, fromStatus: 'SENT',     toStatus: 'RECEIVED', notes: '3 adet teslim alındı' } });

  // Purchase Invoice
  const purchInv = await prisma.invoice.create({
    data: {
      tenantId, contactId: supplier1.id, purchaseOrderId: po1.id,
      type: 'PURCHASE', status: 'PAID', number: 'INV-000005',
      date: d('2026-04-05'), dueDate: d('2026-06-05'),
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      lines: { create: [
        { tenantId, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15" x3', quantity: 3, unitPrice: 18000, discount: 0, taxAmount: 10800, lineTotal: 64800, sortOrder: 0 },
      ]},
    },
  });

  // Stock movements for received goods
  await prisma.stockMovement.create({
    data: { tenantId, productId: products[0].id, type: 'IN', quantity: 3, toWarehouseId: warehouse.id, unitCost: 18000, refType: 'PURCHASE_ORDER', refId: po1.id, notes: `Satın alma teslimi: ${po1.number}` },
  });
  await prisma.stockLevel.updateMany({
    where: { tenantId, productId: products[0].id, warehouseId: warehouse.id },
    data: { quantity: { increment: 3 } },
  });

  // Account entry for purchase invoice
  await prisma.accountEntry.create({
    data: { tenantId, contactId: supplier1.id, date: d('2026-04-05'), debit: 0, credit: 64800, balance: -64800, description: 'INV-000005 alış faturası', refType: 'INVOICE', refId: purchInv.id },
  });

  // Second PO - partially received
  const po2 = await prisma.purchaseOrder.create({
    data: {
      tenantId, contactId: supplier2.id, number: 'PO-000002',
      date: d('2026-04-12'), dueDate: d('2026-05-12'), status: 'PARTIALLY_RECEIVED',
      totalNet: 8500, totalTax: 850, totalGross: 9350,
      items: { create: [
        { tenantId, productId: products[5].id, description: 'A4 Kağıt x100', quantity: 100, unitPrice: 85, discount: 0, taxRate: 10, taxAmount: 850, lineTotal: 9350, received: 50, sortOrder: 0 },
      ]},
    },
  });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po2.id, toStatus: 'DRAFT' } });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po2.id, fromStatus: 'DRAFT', toStatus: 'SENT' } });
  await prisma.purchaseOrderHistory.create({ data: { tenantId, orderId: po2.id, fromStatus: 'SENT', toStatus: 'PARTIALLY_RECEIVED', notes: '50 paket teslim alındı' } });

  // Update purchase request with PO link
  await prisma.purchaseRequest.update({ where: { id: pr1.id }, data: { status: 'ORDERED', purchaseOrderId: po1.id } });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ACCOUNTING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedAccounting(
  tenantId: string,
  accounts: { id: string }[],
  invoices: { id: string }[],
) {
  const [accKasa, accBanka, accAlici, accMal, accIndKdv, accSatici, accHesKdv, , accSatis, , accMaliyet] = accounts;

  // Fiscal Period Q1
  const fp1 = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Q1 (Ocak-Mart)', startDate: d('2026-01-01'), endDate: d('2026-03-31'), status: 'CLOSED', closedAt: d('2026-04-05') },
  });

  // Fiscal Period Q2 (open)
  const fp2 = await prisma.fiscalPeriod.create({
    data: { tenantId, name: '2026 Q2 (Nisan-Haziran)', startDate: d('2026-04-01'), endDate: d('2026-06-30'), status: 'OPEN' },
  });

  // Journal Entries
  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp1.id, type: 'AUTO_INVOICE', number: 'JE-000001',
      date: d('2026-03-22'), description: 'INV-000001 satış faturası kaydı', isPosted: true, postedAt: d('2026-03-22'),
      lines: { create: [
        { tenantId, accountId: accAlici.id,  debit: 31556.4, credit: 0,       description: 'Alıcı borç',       sortOrder: 0 },
        { tenantId, accountId: accSatis.id,  debit: 0,       credit: 26297,   description: 'Satış geliri',     sortOrder: 1 },
        { tenantId, accountId: accHesKdv.id, debit: 0,       credit: 5259.4,  description: 'Hesaplanan KDV',   sortOrder: 2 },
      ]},
    },
  });

  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp1.id, type: 'AUTO_PAYMENT', number: 'JE-000002',
      date: d('2026-03-25'), description: 'EFT-2026-001 tahsilat kaydı', isPosted: true, postedAt: d('2026-03-25'),
      lines: { create: [
        { tenantId, accountId: accBanka.id,  debit: 31556.4, credit: 0,       description: 'Banka tahsilat',   sortOrder: 0 },
        { tenantId, accountId: accAlici.id,  debit: 0,       credit: 31556.4, description: 'Alıcı kapatma',   sortOrder: 1 },
      ]},
    },
  });

  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp2.id, type: 'AUTO_INVOICE', number: 'JE-000003',
      date: d('2026-04-05'), description: 'INV-000005 alış faturası kaydı', isPosted: true, postedAt: d('2026-04-05'),
      lines: { create: [
        { tenantId, accountId: accMal.id,    debit: 54000,   credit: 0,       description: 'Mal alımı',        sortOrder: 0 },
        { tenantId, accountId: accIndKdv.id, debit: 10800,   credit: 0,       description: 'İndirilecek KDV',  sortOrder: 1 },
        { tenantId, accountId: accSatici.id, debit: 0,       credit: 64800,   description: 'Satıcı borç',      sortOrder: 2 },
      ]},
    },
  });

  // Manual journal entry
  await prisma.journalEntry.create({
    data: {
      tenantId, fiscalPeriodId: fp2.id, type: 'MANUAL', number: 'JE-000004',
      date: d('2026-04-30'), description: 'Nisan kira gideri', isPosted: false,
      lines: { create: [
        { tenantId, accountId: accounts[12].id, debit: 15000, credit: 0,     description: 'Kira gideri',  sortOrder: 0 },
        { tenantId, accountId: accBanka.id,      debit: 0,     credit: 15000, description: 'Banka çıkış', sortOrder: 1 },
      ]},
    },
  });

  // Reconciliation
  const recon = await prisma.reconciliation.create({
    data: { tenantId, name: 'Mart 2026 Banka Mutabakatı', date: d('2026-03-31'), isFinalized: true, finalizedAt: d('2026-04-02') },
  });
  await prisma.reconciliationLine.createMany({
    data: [
      { tenantId, reconciliationId: recon.id, accountId: accBanka.id, refType: 'PAYMENT', refId: invoices[0].id, amount: 31556.4, isMatched: true, notes: 'EFT-2026-001' },
    ],
  });

  // Bank Transactions
  await prisma.bankTransaction.createMany({
    data: [
      { tenantId, bankAccountId: (await prisma.bankAccount.findFirst({ where: { tenantId } }))!.id, type: 'DEPOSIT',    amount: 31556.4, balanceAfter: 31556.4, date: d('2026-03-25'), description: 'EFT-2026-001 tahsilat', refType: 'PAYMENT' },
      { tenantId, bankAccountId: (await prisma.bankAccount.findFirst({ where: { tenantId } }))!.id, type: 'WITHDRAWAL', amount: 64800,   balanceAfter: -33243.6, date: d('2026-04-06'), description: 'PO-000001 tedarikçi ödemesi', refType: 'PAYMENT' },
      { tenantId, bankAccountId: (await prisma.bankAccount.findFirst({ where: { tenantId } }))!.id, type: 'DEPOSIT',    amount: 10000,   balanceAfter: -23243.6, date: d('2026-04-10'), description: 'EFT-2026-003 kısmi tahsilat', refType: 'PAYMENT' },
    ],
  });

  // Check/Promissory Notes
  await prisma.checkPromissoryNote.createMany({
    data: [
      { tenantId, type: 'CHECK', number: 'CHK-001', amount: 20000, currencyCode: 'TRY', issueDate: d('2026-04-01'), dueDate: d('2026-05-01'), bankName: 'Garanti BBVA', status: 'PENDING',   notes: 'Müşteri çeki' },
      { tenantId, type: 'CHECK', number: 'CHK-002', amount: 15000, currencyCode: 'TRY', issueDate: d('2026-03-15'), dueDate: d('2026-04-15'), bankName: 'İş Bankası',   status: 'CLEARED',   notes: 'Tahsil edildi' },
      { tenantId, type: 'PROMISSORY_NOTE', number: 'SEN-001', amount: 50000, currencyCode: 'TRY', issueDate: d('2026-04-10'), dueDate: d('2026-07-10'), status: 'PENDING', notes: 'Yıldız Holding senedi' },
    ],
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HR & PAYROLL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedHR(tenantId: string) {
  const employees = await Promise.all([
    prisma.employee.create({ data: { tenantId, firstName: 'Ahmet',   lastName: 'Yılmaz',  email: 'ahmet@axondemo.com',   phone: '+90 532 100 0001', position: 'Genel Müdür',       department: 'Yönetim',    hireDate: d('2020-01-15'), salary: 45000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Zeynep',  lastName: 'Kaya',    email: 'zeynep@axondemo.com',  phone: '+90 532 100 0002', position: 'Satış Müdürü',      department: 'Satış',      hireDate: d('2021-03-01'), salary: 35000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Mehmet',  lastName: 'Demir',   email: 'mehmet@axondemo.com',  phone: '+90 532 100 0003', position: 'Muhasebe Uzmanı',   department: 'Muhasebe',   hireDate: d('2021-06-15'), salary: 30000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Ali',     lastName: 'Çelik',   email: 'ali@axondemo.com',     phone: '+90 532 100 0004', position: 'Depo Sorumlusu',    department: 'Lojistik',   hireDate: d('2022-02-01'), salary: 22000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Fatma',   lastName: 'Şahin',   email: 'fatma@axondemo.com',   phone: '+90 532 100 0005', position: 'Yazılım Geliştirici',department: 'Teknoloji', hireDate: d('2022-09-01'), salary: 40000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Mustafa', lastName: 'Arslan',  email: 'mustafa@axondemo.com', phone: '+90 532 100 0006', position: 'Satış Temsilcisi',  department: 'Satış',      hireDate: d('2023-01-10'), salary: 25000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Ayşe',    lastName: 'Koç',     email: 'ayse@axondemo.com',    phone: '+90 532 100 0007', position: 'İK Uzmanı',         department: 'İnsan Kaynakları', hireDate: d('2023-05-15'), salary: 28000, isActive: true } }),
    prisma.employee.create({ data: { tenantId, firstName: 'Hasan',   lastName: 'Öztürk',  email: 'hasan@axondemo.com',   phone: '+90 532 100 0008', position: 'Üretim Operatörü',  department: 'Üretim',     hireDate: d('2024-01-08'), salary: 20000, isActive: true } }),
  ]);

  // Leave Requests
  await prisma.leaveRequest.createMany({
    data: [
      { tenantId, employeeId: employees[1].id, type: 'ANNUAL',  status: 'APPROVED', startDate: d('2026-04-14'), endDate: d('2026-04-18'), days: 5, approvedAt: d('2026-04-10'), notes: 'Yıllık izin' },
      { tenantId, employeeId: employees[4].id, type: 'SICK',    status: 'APPROVED', startDate: d('2026-04-07'), endDate: d('2026-04-08'), days: 2, approvedAt: d('2026-04-07'), notes: 'Hastalık izni' },
      { tenantId, employeeId: employees[2].id, type: 'ANNUAL',  status: 'PENDING',  startDate: d('2026-05-19'), endDate: d('2026-05-23'), days: 5, notes: 'Yıllık izin talebi' },
      { tenantId, employeeId: employees[5].id, type: 'UNPAID',  status: 'REJECTED', startDate: d('2026-04-20'), endDate: d('2026-04-25'), days: 6, notes: 'Ücretsiz izin talebi' },
    ],
  });

  // Attendance (son 5 iş günü)
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
        paidAt: d('2026-04-30'), notes: 'Nisan 2026 maaşı',
      },
    });
    await prisma.payrollItem.createMany({
      data: [
        { tenantId, payrollId: payroll.id, label: 'SGK İşçi Payı (%14)',  amount: Number(emp.salary) * 0.14, isDeduction: true },
        { tenantId, payrollId: payroll.id, label: 'İşsizlik Sigortası (%1)', amount: Number(emp.salary) * 0.01, isDeduction: true },
      ],
    });
  }

  // Payroll - Mart 2026 (önceki ay)
  for (const emp of employees.slice(0, 4)) {
    await prisma.payroll.create({
      data: {
        tenantId, employeeId: emp.id, period: '2026-03',
        grossSalary: emp.salary, deductions: Number(emp.salary) * 0.15, netSalary: Number(emp.salary) * 0.85,
        paidAt: d('2026-03-31'),
      },
    });
  }

  return employees;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PRODUCTION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedProduction(
  tenantId: string,
  products: { id: string }[],
  master: Awaited<ReturnType<typeof seedMasterData>>,
  warehouse: { id: string },
  warehouse2: { id: string },
) {
  // Work Centers
  const [wcMontaj, wcTest, wcPaketleme] = await Promise.all([
    prisma.workCenter.create({ data: { tenantId, code: 'WC01', name: 'Montaj Hattı',    description: 'Ürün montaj istasyonu',    capacity: 8,  isActive: true } }),
    prisma.workCenter.create({ data: { tenantId, code: 'WC02', name: 'Test İstasyonu',  description: 'Kalite kontrol ve test',   capacity: 4,  isActive: true } }),
    prisma.workCenter.create({ data: { tenantId, code: 'WC03', name: 'Paketleme Hattı', description: 'Son paketleme ve etiket',  capacity: 6,  isActive: true } }),
  ]);

  // BOM - Laptop Kasası üretimi
  const bom1 = await prisma.bOM.create({
    data: {
      tenantId, productId: products[12].id, name: 'Laptop Kasası BOM v1.0', version: '1.0', isActive: true,
      items: { create: [
        { tenantId, productId: products[10].id, quantity: 0.5, unit: 'KG', notes: 'Alüminyum profil', sortOrder: 0 },
        { tenantId, productId: products[11].id, quantity: 0.2, unit: 'KG', notes: 'Plastik granül',   sortOrder: 1 },
      ]},
      routings: { create: [
        { tenantId, workCenterId: wcMontaj.id,    name: 'Kasa Montajı',   stepOrder: 1, setupTime: 15, runTime: 30 },
        { tenantId, workCenterId: wcTest.id,      name: 'Kalite Kontrol', stepOrder: 2, setupTime: 5,  runTime: 10 },
        { tenantId, workCenterId: wcPaketleme.id, name: 'Paketleme',      stepOrder: 3, setupTime: 5,  runTime: 5  },
      ]},
    },
  });

  // Work Orders
  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId, productId: products[12].id, bomId: bom1.id, number: 'WO-000001',
      status: 'COMPLETED', plannedQty: 20, producedQty: 20,
      startDate: d('2026-04-01'), endDate: d('2026-04-05'),
      inputWarehouseId: warehouse2.id, outputWarehouseId: warehouse2.id,
      items: { create: [
        { tenantId, productId: products[10].id, requiredQty: 10, consumedQty: 10, sourceWarehouseId: warehouse2.id },
        { tenantId, productId: products[11].id, requiredQty: 4,  consumedQty: 4,  sourceWarehouseId: warehouse2.id },
      ]},
      operations: { create: [
        { tenantId, workCenterId: wcMontaj.id,    name: 'Kasa Montajı',   stepOrder: 1, status: 'COMPLETED', actualStartAt: d('2026-04-01'), actualEndAt: d('2026-04-03') },
        { tenantId, workCenterId: wcTest.id,      name: 'Kalite Kontrol', stepOrder: 2, status: 'COMPLETED', actualStartAt: d('2026-04-03'), actualEndAt: d('2026-04-04') },
        { tenantId, workCenterId: wcPaketleme.id, name: 'Paketleme',      stepOrder: 3, status: 'COMPLETED', actualStartAt: d('2026-04-04'), actualEndAt: d('2026-04-05') },
      ]},
      history: { create: [
        { tenantId, toStatus: 'PLANNED' },
        { tenantId, fromStatus: 'PLANNED',     toStatus: 'IN_PROGRESS', notes: 'Üretime başlandı' },
        { tenantId, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED',   notes: '20 adet üretildi' },
      ]},
    },
  });

  const wo2 = await prisma.workOrder.create({
    data: {
      tenantId, productId: products[12].id, bomId: bom1.id, number: 'WO-000002',
      status: 'IN_PROGRESS', plannedQty: 15, producedQty: 8,
      startDate: d('2026-04-20'),
      inputWarehouseId: warehouse2.id, outputWarehouseId: warehouse2.id,
      items: { create: [
        { tenantId, productId: products[10].id, requiredQty: 7.5, consumedQty: 4, sourceWarehouseId: warehouse2.id },
        { tenantId, productId: products[11].id, requiredQty: 3,   consumedQty: 1.6, sourceWarehouseId: warehouse2.id },
      ]},
      history: { create: [
        { tenantId, toStatus: 'PLANNED' },
        { tenantId, fromStatus: 'PLANNED', toStatus: 'IN_PROGRESS', notes: 'Üretime başlandı' },
      ]},
    },
  });

  const wo3 = await prisma.workOrder.create({
    data: {
      tenantId, productId: products[12].id, bomId: bom1.id, number: 'WO-000003',
      status: 'PLANNED', plannedQty: 30, producedQty: 0,
      startDate: d('2026-05-10'), endDate: d('2026-05-20'),
      inputWarehouseId: warehouse2.id, outputWarehouseId: warehouse2.id,
      history: { create: [{ tenantId, toStatus: 'PLANNED' }] },
    },
  });

  // Stock movements for completed WO
  await prisma.stockMovement.create({
    data: { tenantId, productId: products[12].id, type: 'IN', quantity: 20, toWarehouseId: warehouse2.id, refType: 'WORK_ORDER', refId: wo1.id, notes: `İş emri ${wo1.number} üretim çıktısı` },
  });
  await prisma.stockLevel.updateMany({
    where: { tenantId, productId: products[12].id, warehouseId: warehouse2.id },
    data: { quantity: { increment: 20 } },
  });

  return { bom1, workOrders: [wo1, wo2, wo3] };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SERVICE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedService(
  tenantId: string,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  products: { id: string }[],
) {
  const [c1, c2, c3] = contacts;

  // Customer Assets
  const [asset1, asset2, asset3] = await Promise.all([
    prisma.customerAsset.create({ data: { tenantId, contactId: c1.id, name: 'Laptop Pro 15" SN:LP001', brand: 'Axon', model: 'Pro 15', serialNo: 'LP-2024-001', purchaseDate: d('2024-06-15'), warrantyEnd: d('2026-06-15'), isActive: true } }),
    prisma.customerAsset.create({ data: { tenantId, contactId: c2.id, name: 'Akıllı Telefon X12 SN:AT001', brand: 'Axon', model: 'X12', serialNo: 'AT-2025-001', purchaseDate: d('2025-01-10'), warrantyEnd: d('2027-01-10'), isActive: true } }),
    prisma.customerAsset.create({ data: { tenantId, contactId: c3.id, name: 'Monitor 27" SN:MN001', brand: 'Axon', model: '27K', serialNo: 'MN-2023-001', purchaseDate: d('2023-09-20'), warrantyEnd: d('2025-09-20'), isActive: true } }),
  ]);

  // Service Requests
  const sr1 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c1.id, customerAssetId: asset1.id,
      number: 'SR-000001', status: 'COMPLETED', priority: 'HIGH',
      subject: 'Laptop ekran sorunu - piksel hatası',
      description: 'Ekranın sol alt köşesinde ölü piksel var, garanti kapsamında değişim talep ediliyor.',
      warrantyEnd: asset1.warrantyEnd, closedAt: d('2026-04-10'),
      items: { create: [
        { tenantId, productId: products[0].id, description: 'Ekran değişimi işçilik', quantity: 1, unitPrice: 0, lineTotal: 0 },
      ]},
      activities: { create: [
        { tenantId, activityType: 'NOTE',          notes: 'Müşteri cihazı teslim etti', createdAt: d('2026-04-05') },
        { tenantId, activityType: 'STATUS_CHANGE',  notes: 'OPEN â†’ IN_PROGRESS',        createdAt: d('2026-04-06') },
        { tenantId, activityType: 'CALL',           notes: 'Müşteri bilgilendirildi, parça bekleniyor', createdAt: d('2026-04-07') },
        { tenantId, activityType: 'STATUS_CHANGE',  notes: 'IN_PROGRESS â†’ COMPLETED',   createdAt: d('2026-04-10') },
      ]},
      history: { create: [
        { tenantId, toStatus: 'OPEN' },
        { tenantId, fromStatus: 'OPEN',        toStatus: 'IN_PROGRESS', notes: 'Teknik inceleme başladı' },
        { tenantId, fromStatus: 'IN_PROGRESS', toStatus: 'WAITING_PARTS', notes: 'Ekran parçası bekleniyor' },
        { tenantId, fromStatus: 'WAITING_PARTS', toStatus: 'IN_PROGRESS', notes: 'Parça geldi, montaj yapılıyor' },
        { tenantId, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', notes: 'Ekran değiştirildi, test edildi' },
      ]},
    },
  });

  const sr2 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c2.id, customerAssetId: asset2.id,
      number: 'SR-000002', status: 'IN_PROGRESS', priority: 'MEDIUM',
      subject: 'Telefon batarya şişmesi',
      description: 'Batarya şişmiş, cihaz kapanmıyor. Garanti kapsamında değişim.',
      warrantyEnd: asset2.warrantyEnd,
      items: { create: [
        { tenantId, description: 'Batarya değişimi', quantity: 1, unitPrice: 0, lineTotal: 0 },
      ]},
      activities: { create: [
        { tenantId, activityType: 'NOTE',         notes: 'Cihaz teslim alındı, inceleme başladı' },
        { tenantId, activityType: 'STATUS_CHANGE', notes: 'OPEN â†’ IN_PROGRESS' },
      ]},
      history: { create: [
        { tenantId, toStatus: 'OPEN' },
        { tenantId, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', notes: 'Teknik inceleme başladı' },
      ]},
    },
  });

  const sr3 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c3.id, customerAssetId: asset3.id,
      number: 'SR-000003', status: 'OPEN', priority: 'LOW',
      subject: 'Monitor renk kalibrasyonu',
      description: 'Renk kalibrasyonu bozulmuş, profesyonel kalibrasyon talep ediliyor.',
      warrantyEnd: asset3.warrantyEnd,
      history: { create: [{ tenantId, toStatus: 'OPEN' }] },
    },
  });

  // Ücretli servis talebi (garanti dışı)
  const sr4 = await prisma.serviceRequest.create({
    data: {
      tenantId, contactId: c1.id,
      number: 'SR-000004', status: 'WAITING_CUSTOMER', priority: 'CRITICAL',
      subject: 'Sunucu bakım ve güncelleme',
      description: 'Yıllık bakım sözleşmesi kapsamında sunucu bakımı.',
      items: { create: [
        { tenantId, description: 'Sunucu bakım hizmeti (8 saat)', quantity: 8, unitPrice: 500, lineTotal: 4000 },
        { tenantId, description: 'Yedek parça - RAM 32GB',        quantity: 2, unitPrice: 2500, lineTotal: 5000 },
      ]},
      activities: { create: [
        { tenantId, activityType: 'CALL',  notes: 'Müşteri onayı bekleniyor - teklif gönderildi' },
      ]},
      history: { create: [
        { tenantId, toStatus: 'OPEN' },
        { tenantId, fromStatus: 'OPEN', toStatus: 'WAITING_CUSTOMER', notes: 'Teklif onayı bekleniyor' },
      ]},
    },
  });

  return [sr1, sr2, sr3, sr4];
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MARKETPLACE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedMarketplace(tenantId: string, products: { id: string }[]) {
  const integration = await prisma.marketplaceIntegration.create({
    data: {
      tenantId, channel: 'TRENDYOL', name: 'Trendyol Mağazası',
      apiKey: 'test-key', apiSecret: 'test-secret',
      storeId: '12345', isActive: true, lastSyncAt: d('2026-05-03'),
    },
  });

  // Listings
  const listings = await Promise.all([
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: integration.id, productId: products[0].id, externalId: 'TY-LP001', externalSku: 'AXON-LP-001', price: 24999, stock: 10, isActive: true, lastSyncAt: d('2026-05-03') } }),
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: integration.id, productId: products[1].id, externalId: 'TY-KB001', externalSku: 'AXON-KB-001', price: 1299,  stock: 40, isActive: true, lastSyncAt: d('2026-05-03') } }),
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: integration.id, productId: products[2].id, externalId: 'TY-MS001', externalSku: 'AXON-MS-001', price: 599,   stock: 35, isActive: true, lastSyncAt: d('2026-05-03') } }),
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: integration.id, productId: products[3].id, externalId: 'TY-PH001', externalSku: 'AXON-PH-001', price: 16999, stock: 5,  isActive: true, lastSyncAt: d('2026-05-03') } }),
    prisma.marketplaceListing.create({ data: { tenantId, integrationId: integration.id, productId: products[4].id, externalId: 'TY-HB001', externalSku: 'AXON-HB-001', price: 499,   stock: 60, isActive: true, lastSyncAt: d('2026-05-03') } }),
  ]);

  // Listing Snapshots
  for (const listing of listings) {
    await prisma.marketplaceListingSnapshot.create({
      data: { tenantId, listingId: listing.id, lastSentQty: listing.stock, lastSentSalePrice: listing.price, lastSentListPrice: Number(listing.price) * 1.05, lastSentAt: d('2026-05-03'), batchRequestId: `BATCH-${listing.externalId}` },
    });
  }

  // Marketplace Orders
  const orders = await Promise.all([
    prisma.marketplaceOrder.create({
      data: {
        tenantId, integrationId: integration.id, externalId: 'TY-ORD-001', channel: 'TRENDYOL',
        status: 'DELIVERED', customerName: 'Burak Yıldız', customerEmail: 'burak@email.com',
        customerPhone: '+90 555 111 0001', shippingAddress: 'Kadıköy, İstanbul',
        totalAmount: 24999, orderDate: d('2026-04-20'), syncedAt: d('2026-04-20'),
        items: { create: [{ tenantId, externalProductId: 'TY-LP001', productId: products[0].id, name: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, lineTotal: 24999 }] },
      },
    }),
    prisma.marketplaceOrder.create({
      data: {
        tenantId, integrationId: integration.id, externalId: 'TY-ORD-002', channel: 'TRENDYOL',
        status: 'SHIPPED', customerName: 'Selin Arslan', customerEmail: 'selin@email.com',
        customerPhone: '+90 555 111 0002', shippingAddress: 'Beşiktaş, İstanbul',
        totalAmount: 2597, orderDate: d('2026-04-28'), syncedAt: d('2026-04-28'),
        items: { create: [
          { tenantId, externalProductId: 'TY-KB001', productId: products[1].id, name: 'Mekanik Klavye RGB', quantity: 1, unitPrice: 1299, lineTotal: 1299 },
          { tenantId, externalProductId: 'TY-MS001', productId: products[2].id, name: 'Kablosuz Mouse Pro', quantity: 2, unitPrice: 599,  lineTotal: 1198 },
        ]},
      },
    }),
    prisma.marketplaceOrder.create({
      data: {
        tenantId, integrationId: integration.id, externalId: 'TY-ORD-003', channel: 'TRENDYOL',
        status: 'PROCESSING', customerName: 'Emre Kılıç', customerEmail: 'emre@email.com',
        customerPhone: '+90 555 111 0003', shippingAddress: 'Ankara',
        totalAmount: 16999, orderDate: d('2026-05-03'), syncedAt: d('2026-05-03'),
        items: { create: [{ tenantId, externalProductId: 'TY-PH001', productId: products[3].id, name: 'Akıllı Telefon X12', quantity: 1, unitPrice: 16999, lineTotal: 16999 }] },
      },
    }),
    prisma.marketplaceOrder.create({
      data: {
        tenantId, integrationId: integration.id, externalId: 'TY-ORD-004', channel: 'TRENDYOL',
        status: 'CANCELLED', customerName: 'Deniz Yılmaz', customerEmail: 'deniz@email.com',
        customerPhone: '+90 555 111 0004', shippingAddress: 'İzmir',
        totalAmount: 499, orderDate: d('2026-04-25'), syncedAt: d('2026-04-25'),
        items: { create: [{ tenantId, externalProductId: 'TY-HB001', productId: products[4].id, name: 'USB-C Hub 7 Port', quantity: 1, unitPrice: 499, lineTotal: 499 }] },
      },
    }),
  ]);

  // Sync Jobs
  await prisma.marketplaceSyncJob.createMany({
    data: [
      { tenantId, integrationId: integration.id, jobType: 'SYNC_ORDERS', status: 'DONE',    processedCount: 4, errorCount: 0, startedAt: d('2026-05-03'), finishedAt: d('2026-05-03'), params: { hoursBack: 24 }, result: { created: 2, updated: 1, skipped: 1 } },
      { tenantId, integrationId: integration.id, jobType: 'SYNC_STOCK',  status: 'DONE',    processedCount: 5, errorCount: 0, startedAt: d('2026-05-03'), finishedAt: d('2026-05-03'), params: { force: false }, result: { sent: 5, skipped: 0 } },
      { tenantId, integrationId: integration.id, jobType: 'SYNC_ORDERS', status: 'FAILED',  processedCount: 0, errorCount: 1, startedAt: d('2026-05-04'), finishedAt: d('2026-05-04'), params: { hoursBack: 1 }, errorMessage: 'Demo credentials - API not available' },
    ],
  });

  // Webhook Events
  await prisma.marketplaceWebhookEvent.createMany({
    data: [
      { tenantId, integrationId: integration.id, eventId: 'EVT-001', eventType: 'ORDER_STATUS_CHANGED', payload: { shipmentPackageId: 'TY-ORD-001', status: 'Delivered' }, processedAt: d('2026-04-22') },
      { tenantId, integrationId: integration.id, eventId: 'EVT-002', eventType: 'ORDER_STATUS_CHANGED', payload: { shipmentPackageId: 'TY-ORD-002', status: 'Shipped'   }, processedAt: d('2026-04-29') },
    ],
  });

  return { integration, listings, orders };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ROLES & PERMISSIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedRoles(tenantId: string, users: { id: string }[]) {
  const [, userSales, userAccounting, userWarehouse] = users;

  const roleSales = await prisma.role.create({
    data: {
      tenantId, name: 'Satış Temsilcisi', description: 'Satış modülü tam erişim', isSystem: false,
      permissions: { create: [
        { module: 'invoicing', action: 'CREATE' },
        { module: 'invoicing', action: 'READ'   },
        { module: 'invoicing', action: 'UPDATE' },
        { module: 'contacts',  action: 'READ'   },
        { module: 'contacts',  action: 'CREATE' },
        { module: 'contacts',  action: 'UPDATE' },
        { module: 'inventory', action: 'READ'   },
        { module: 'reporting', action: 'READ'   },
      ]},
    },
  });

  const roleAccounting = await prisma.role.create({
    data: {
      tenantId, name: 'Muhasebe Uzmanı', description: 'Muhasebe ve finans tam erişim', isSystem: false,
      permissions: { create: [
        { module: 'accounting', action: 'CREATE' },
        { module: 'accounting', action: 'READ'   },
        { module: 'accounting', action: 'UPDATE' },
        { module: 'accounting', action: 'DELETE' },
        { module: 'invoicing',  action: 'READ'   },
        { module: 'invoicing',  action: 'UPDATE' },
        { module: 'reporting',  action: 'READ'   },
        { module: 'reporting',  action: 'EXPORT' },
        { module: 'payroll',    action: 'READ'   },
        { module: 'payroll',    action: 'UPDATE' },
        { module: 'payroll',    action: 'APPROVE' },
        { module: 'payroll',    action: 'EXPORT' },
      ]},
    },
  });

  const roleWarehouse = await prisma.role.create({
    data: {
      tenantId, name: 'Depo Sorumlusu', description: 'Stok ve depo yönetimi', isSystem: false,
      permissions: { create: [
        { module: 'inventory', action: 'CREATE' },
        { module: 'inventory', action: 'READ'   },
        { module: 'inventory', action: 'UPDATE' },
        { module: 'purchasing', action: 'READ'  },
      ]},
    },
  });

  // Assign roles to users
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userSales.id },      data: { roleId: roleSales.id } });
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userAccounting.id }, data: { roleId: roleAccounting.id } });
  await prisma.tenantUser.updateMany({ where: { tenantId, userId: userWarehouse.id },  data: { roleId: roleWarehouse.id } });

  // Approval Flow
  await prisma.approvalFlow.create({
    data: {
      tenantId, name: 'Satın Alma Onay Akışı', module: 'PURCHASE_REQUEST', isActive: true,
      steps: { create: [
        { stepOrder: 1, name: 'Departman Müdürü Onayı', approverRoleId: roleSales.id,      isRequired: true },
        { stepOrder: 2, name: 'Finans Onayı',           approverRoleId: roleAccounting.id, isRequired: true },
      ]},
    },
  });

  await prisma.approvalFlow.create({
    data: {
      tenantId, name: 'İzin Onay Akışı', module: 'LEAVE_REQUEST', isActive: true,
      steps: { create: [
        { stepOrder: 1, name: 'Yönetici Onayı', approverRoleId: roleSales.id, isRequired: true },
      ]},
    },
  });

  return { roleSales, roleAccounting, roleWarehouse };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NOTIFICATIONS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedNotifications(tenantId: string, userId: string) {
  await prisma.notification.createMany({
    data: [
      { tenantId, userId, title: 'Yeni Sipariş Alındı',          message: 'SIP-000004 numaralı sipariş oluşturuldu.',          module: 'invoicing',  entityType: 'SALES_ORDER', status: 'UNREAD',    createdAt: d('2026-04-15') },
      { tenantId, userId, title: 'Fatura Vadesi Yaklaşıyor',      message: 'INV-000002 faturasının vadesi 3 gün sonra.',         module: 'invoicing',  entityType: 'INVOICE',     status: 'UNREAD',    createdAt: d('2026-04-09') },
      { tenantId, userId, title: 'Gecikmiş Fatura',               message: 'INV-000003 faturası 60 gün gecikmiş.',              module: 'invoicing',  entityType: 'INVOICE',     status: 'READ',      createdAt: d('2026-04-01'), readAt: d('2026-04-02') },
      { tenantId, userId, title: 'Stok Uyarısı',                  message: 'P006 (A4 Kağıt) minimum stok seviyesinin altında.', module: 'inventory',  entityType: 'PRODUCT',     status: 'UNREAD',    createdAt: d('2026-05-01') },
      { tenantId, userId, title: 'İş Emri Tamamlandı',            message: 'WO-000001 iş emri tamamlandı. 20 adet üretildi.',   module: 'production', entityType: 'WORK_ORDER',  status: 'READ',      createdAt: d('2026-04-05'), readAt: d('2026-04-06') },
      { tenantId, userId, title: 'Servis Talebi Güncellendi',     message: 'SR-000001 servis talebi tamamlandı.',               module: 'service',    entityType: 'SERVICE_REQUEST', status: 'ARCHIVED', createdAt: d('2026-04-10') },
      { tenantId, userId, title: 'Trendyol Senkronizasyonu',      message: '4 sipariş senkronize edildi.',                      module: 'marketplace', status: 'READ',            createdAt: d('2026-05-03'), readAt: d('2026-05-03') },
      { tenantId, userId, title: 'Satın Alma Onayı Bekleniyor',   message: 'PR-000002 satın alma talebi onayınızı bekliyor.',   module: 'purchasing', entityType: 'PURCHASE_ORDER', status: 'UNREAD', createdAt: d('2026-04-10') },
    ],
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SETTINGS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedSettings(tenantId: string) {
  await prisma.tenantSetting.createMany({
    data: [
      { tenantId, key: 'company_logo',       value: 'https://axondemo.com/logo.png' },
      { tenantId, key: 'invoice_prefix',     value: 'INV' },
      { tenantId, key: 'default_currency',   value: 'TRY' },
      { tenantId, key: 'fiscal_year_start',  value: '01-01' },
      { tenantId, key: 'invoice_footer',     value: 'Axon Demo Teknoloji A.Ş. - Tüm hakları saklıdır.' },
      { tenantId, key: 'low_stock_alert',    value: 'true' },
      { tenantId, key: 'email_notifications',value: 'true' },
    ],
  });

  await prisma.moduleSetting.createMany({
    data: [
      { tenantId, module: 'invoicing',   key: 'auto_number',       value: 'true'  },
      { tenantId, module: 'invoicing',   key: 'default_tax_rate',  value: '20'    },
      { tenantId, module: 'invoicing',   key: 'payment_terms',     value: '30'    },
      { tenantId, module: 'inventory',   key: 'costing_method',    value: 'MOVING_AVERAGE' },
      { tenantId, module: 'inventory',   key: 'negative_stock',    value: 'false' },
      { tenantId, module: 'accounting',  key: 'auto_journal',      value: 'true'  },
      { tenantId, module: 'marketplace', key: 'auto_sync_interval',value: '60'    },
      { tenantId, module: 'hr',          key: 'work_hours_per_day',value: '8'     },
      { tenantId, module: 'payroll',     key: 'sgk_rate',          value: '14'    },
    ],
  });

  // Saved Reports
  await prisma.savedReport.createMany({
    data: [
      { tenantId, name: 'Aylık Satış Özeti',     module: 'reporting', filters: { type: 'SALES', period: 'monthly' },  columns: ['date', 'number', 'contact', 'total'], isShared: true  },
      { tenantId, name: 'Stok Durum Raporu',     module: 'reporting', filters: { belowMin: true },                    columns: ['code', 'name', 'qty', 'minStock'],    isShared: true  },
      { tenantId, name: 'Gecikmiş Faturalar',    module: 'reporting', filters: { status: 'OVERDUE' },                 columns: ['number', 'contact', 'dueDate', 'total'], isShared: false },
      { tenantId, name: 'Personel Bordro Özeti', module: 'reporting', filters: { period: '2026-04' },                 columns: ['name', 'department', 'gross', 'net'], isShared: false },
    ],
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STOCK COUNT (Sayım)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedStockCount(tenantId: string, products: { id: string }[], warehouseId: string) {
  await prisma.stockCount.create({
    data: {
      tenantId, warehouseId, number: 'SC-000001', date: d('2026-04-30'),
      isFinalized: false, notes: 'Nisan sonu sayımı',
      items: { create: [
        { tenantId, productId: products[0].id, expectedQty: 15, countedQty: 14, difference: -1 },
        { tenantId, productId: products[1].id, expectedQty: 45, countedQty: 45, difference: 0  },
        { tenantId, productId: products[2].id, expectedQty: 38, countedQty: 39, difference: 1  },
        { tenantId, productId: products[3].id, expectedQty: 7,  countedQty: 7,  difference: 0  },
        { tenantId, productId: products[4].id, expectedQty: 62, countedQty: 60, difference: -2 },
      ]},
    },
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// INVENTORY RESERVATIONS & LOT/SERIAL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedInventoryExtras(tenantId: string, products: { id: string }[], warehouseId: string) {
  // Inventory Reservations
  await prisma.inventoryReservation.createMany({
    data: [
      { tenantId, productId: products[0].id, warehouseId, quantity: 2, refType: 'SALES_ORDER', refId: 'SIP-000004', notes: 'SIP-000004 için rezerve' },
      { tenantId, productId: products[3].id, warehouseId, quantity: 1, refType: 'SALES_ORDER', refId: 'SIP-000002', notes: 'SIP-000002 için rezerve' },
    ],
  });

  // Product Batches
  const batch1 = await prisma.productBatch.create({
    data: { tenantId, productId: products[0].id, batchNumber: 'BATCH-2026-001', expiryDate: null, manufacturedAt: d('2026-01-15'), quantity: 5, notes: 'Ocak 2026 üretim partisi' },
  });
  const batch2 = await prisma.productBatch.create({
    data: { tenantId, productId: products[3].id, batchNumber: 'BATCH-2026-002', expiryDate: null, manufacturedAt: d('2026-02-20'), quantity: 3, notes: 'Şubat 2026 üretim partisi' },
  });

  // Lot/Serial Numbers
  await prisma.lotSerialNumber.createMany({
    data: [
      { tenantId, productId: products[0].id, batchId: batch1.id, serialNumber: 'SN-LP-001', isUsed: false },
      { tenantId, productId: products[0].id, batchId: batch1.id, serialNumber: 'SN-LP-002', isUsed: false },
      { tenantId, productId: products[0].id, batchId: batch1.id, serialNumber: 'SN-LP-003', isUsed: true, usedAt: d('2026-03-22'), usedRefType: 'SALES_ORDER', usedRefId: 'SIP-000001' },
      { tenantId, productId: products[3].id, batchId: batch2.id, serialNumber: 'SN-PH-001', isUsed: false },
      { tenantId, productId: products[3].id, batchId: batch2.id, serialNumber: 'SN-PH-002', isUsed: false },
    ],
  });

  // Stock Valuations
  await prisma.stockValuation.createMany({
    data: [
      { tenantId, productId: products[0].id, warehouseId, date: d('2026-04-01'), qtyIn: 3, qtyOut: 0, qtyBalance: 15, unitCost: 18000, totalValue: 270000 },
      { tenantId, productId: products[1].id, warehouseId, date: d('2026-04-01'), qtyIn: 0, qtyOut: 5, qtyBalance: 45, unitCost: 800,   totalValue: 36000  },
    ],
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN â€” update to call new functions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Update main to include stock count and inventory extras
const _originalMain = main;

async function runSeed() {
  console.log('\nðŸŒ± Seed başlıyor...\n');

  // 1. Admin
  await prisma.adminUser.upsert({
    where: { email: 'admin@axonerp.com' },
    create: { email: 'admin@axonerp.com', name: 'Platform Admin', password: await hash('admin1234'), isActive: true },
    update: { password: await hash('admin1234') },
  });
  console.log('  âœ“ Admin: admin@axonerp.com / admin1234');

  // 2. Plan Features
  await seedPlanFeatures();
  console.log('  âœ“ Plan features (Starter / Professional / Enterprise)');

  // 3. Tenant & Users
  const { tenant, users, planAccounts } = await seedTenant();
  console.log(`  âœ“ Tenant: ${tenant.companyName} (Enterprise)`);
  console.log(`  âœ“ Kullanıcılar: ${users.map(u => u.email).join(', ')}`);
  console.log(`  âœ“ Plan demo hesapları: ${planAccounts.map(({ user }) => user.email).join(', ')}`);

  // 4. Master Data
  const master = await seedMasterData(tenant.id);
  console.log('  âœ“ Master data (birim, kategori, KDV, döviz, hesap planı)');

  // 5. Warehouses
  const { warehouse, warehouse2, locations } = await seedWarehouses(tenant.id);
  console.log('  âœ“ Depolar ve lokasyonlar');

  // 6. Products & Stock
  const products = await seedProducts(tenant.id, master, warehouse, warehouse2, locations);
  console.log(`  âœ“ ${products.length} ürün ve stok seviyeleri`);

  // 7. Contacts
  const contacts = await seedContacts(tenant.id);
  console.log(`  âœ“ ${contacts.length} cari hesap`);

  // 8. Sales
  const { invoices, payments } = await seedSales(tenant.id, contacts, products, master, warehouse);
  console.log(`  âœ“ Satış: ${invoices.length} fatura, ${payments.length} ödeme`);

  // 9. Purchasing
  await seedPurchasing(tenant.id, contacts, products, master, warehouse);
  console.log('  âœ“ Satın alma: talepler ve siparişler');

  // 10. Accounting
  await seedAccounting(tenant.id, master.accounts, invoices);
  console.log('  âœ“ Muhasebe: yevmiye fişleri, mali dönem, mutabakat');

  // 11. HR & Payroll
  await seedHR(tenant.id);
  console.log('  âœ“ İK: personel, izin, puantaj, bordro');

  // 12. Production
  await seedProduction(tenant.id, products, master, warehouse, warehouse2);
  console.log('  âœ“ Üretim: iş merkezleri, BOM, iş emirleri');

  // 13. Service
  await seedService(tenant.id, contacts, products);
  console.log('  âœ“ Servis: müşteri varlıkları, servis talepleri');

  // 14. Marketplace
  await seedMarketplace(tenant.id, products);
  console.log('  âœ“ Pazaryeri: Trendyol entegrasyonu, siparişler');

  // 15. Roles & Permissions
  await seedRoles(tenant.id, users);
  console.log('  âœ“ Roller, izinler ve onay akışları');

  // 16. Notifications
  await seedNotifications(tenant.id, users[0].id);
  console.log('  âœ“ Bildirimler');

  // 17. Settings
  await seedSettings(tenant.id);
  console.log('  âœ“ Tenant ayarları ve kayıtlı raporlar');

  // 18. Stock Count
  await seedStockCount(tenant.id, products, warehouse.id);
  console.log('  âœ“ Stok sayımı');

  // 19. Inventory Extras
  await seedInventoryExtras(tenant.id, products, warehouse.id);
  console.log('  âœ“ Rezervasyonlar, parti/seri numaraları, stok değerleme');

  console.log('\nâœ… Seed tamamlandı!\n');
  console.log('  ðŸ“§ Kullanıcı girişi:');
  console.log('     admin@axondemo.com    / demo1234  (Tenant Admin)');
  console.log('     satis@axondemo.com    / demo1234  (Satış)');
  console.log('     muhasebe@axondemo.com / demo1234  (Muhasebe)');
  console.log('     depo@axondemo.com     / demo1234  (Depo)');
  console.log('     starter@axondemo.com  / demo1234  (Starter)');
  console.log('     pro@axondemo.com      / demo1234  (Professional)');
  console.log('  ðŸ”‘ Platform admin:');
  console.log('     admin@axonerp.com     / admin1234\n');
}

runSeed()
  .catch((e) => {
    console.error('âŒ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


