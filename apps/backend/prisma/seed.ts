import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed başlıyor…');

  // ── Cleanup ──────────────────────────────────
  await prisma.savedReport.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.tenantSetting.deleteMany();
  await prisma.moduleSetting.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.reconciliationLine.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.deliveryNoteItem.deleteMany();
  await prisma.deliveryNote.deleteMany();
  await prisma.invoiceHistory.deleteMany();
  await prisma.salesOrderHistory.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.stockValuation.deleteMany();
  await prisma.productBatch.deleteMany();
  await prisma.currencyRate.deleteMany();
  await prisma.tenantFeatureOverride.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.salesQuoteItem.deleteMany();
  await prisma.salesQuote.deleteMany();
  await prisma.purchaseOrderHistory.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseRequestItem.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.accountEntry.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.product.deleteMany();
  await prisma.location.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.category.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.cashAccount.deleteMany();
  await prisma.journalEntryLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany();
  await prisma.fiscalPeriod.deleteMany();
  await prisma.numberSequence.deleteMany();
  await prisma.tenantUser.deleteMany();
  await prisma.tenantFeatureOverride.deleteMany();
  await prisma.planFeature.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  console.log('  ✓ Eski veriler temizlendi');

  // ── Tenant ───────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      slug: 'axon-demo',
      companyName: 'Axon Demo A.Ş.',
      taxNumber: '1234567890',
      taxOffice: 'Kadıköy',
      email: 'info@axondemo.com',
      phone: '+90 212 555 0100',
      address: 'Bağdat Caddesi No:42',
      city: 'İstanbul',
      country: 'TR',
      sector: 'Teknoloji',
      plan: 'STARTER',
      status: 'ACTIVE',
      modules: ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting'],
    },
  });
  console.log(`  ✓ Tenant: ${tenant.companyName}`);

  // ── User ─────────────────────────────────────
  const hashedPassword = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.create({
    data: {
      email: 'admin@axondemo.com',
      name: 'Ahmet Yılmaz',
      phone: '+90 532 555 0101',
      password: hashedPassword,
      isActive: true,
    },
  });

  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: user.id, isOwner: true, isActive: true },
  });
  console.log(`  ✓ Kullanıcı: ${user.email} / şifre: demo1234`);

  // ── Plan Features ─────────────────────────────
  const planFeatures = [
    { plan: 'STARTER' as const, key: 'max_users', featureKey: 'MAX_USERS' as const, value: '5', type: 'LIMIT' as const },
    { plan: 'STARTER' as const, key: 'max_products', featureKey: 'MAX_PRODUCTS' as const, value: '500', type: 'LIMIT' as const },
    { plan: 'STARTER' as const, key: 'multi_warehouse', featureKey: 'MULTI_WAREHOUSE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'api_access', featureKey: 'API_ACCESS' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'audit_log', featureKey: 'AUDIT_LOG' as const, value: 'basic', type: 'ENUM' as const },
  ];

  for (const pf of planFeatures) {
    await prisma.planFeature.upsert({
      where: { plan_key: { plan: pf.plan, key: pf.key } },
      create: pf,
      update: { value: pf.value },
    });
  }
  console.log('  ✓ Plan features');

  // ── Master Data ───────────────────────────────

  // Units
  const [unitAdet, unitKg, unitLt, unitMt] = await Promise.all([
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Adet', code: 'AD' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Kilogram', code: 'KG' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Litre', code: 'LT' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Metre', code: 'MT' } }),
  ]);

  // Categories
  const catElektronik = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Elektronik' } });
  const catBilgisayar = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Bilgisayar', parentId: catElektronik.id } });
  const catTelefon = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Telefon', parentId: catElektronik.id } });
  const catOfis = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Ofis Malzemeleri' } });

  // Tax Rates
  const [kdv0, kdv10, kdv20] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %0', rate: 0 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %10', rate: 10 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %20', rate: 20 } }),
  ]);

  // Currencies
  await Promise.all([
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'TRY', name: 'Türk Lirası', symbol: '₺', defaultRate: 1, isBase: true } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'USD', name: 'Amerikan Doları', symbol: '$', defaultRate: 32.5 } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'EUR', name: 'Euro', symbol: '€', defaultRate: 35.2 } }),
  ]);

  console.log('  ✓ Master data (birim, kategori, KDV, döviz)');

  // ── Warehouse ─────────────────────────────────
  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: 'Ana Depo', code: 'WH01', address: 'Dudullu OSB, İstanbul' },
  });

  const [locA1, locA2, locB1] = await Promise.all([
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf A-1', code: 'A-1' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf A-2', code: 'A-2' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf B-1', code: 'B-1' } }),
  ]);

  console.log('  ✓ Depo ve lokasyonlar');

  // ── Products ──────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P001', name: 'Laptop Pro 15"', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 18000, salesPrice: 24999, minStockLevel: 5, averageCost: 18000 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P002', name: 'Mekanik Klavye', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 800, salesPrice: 1299, minStockLevel: 10, averageCost: 800 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P003', name: 'Kablosuz Mouse', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 350, salesPrice: 599, minStockLevel: 15, averageCost: 350 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P004', name: 'Akıllı Telefon X12', unitId: unitAdet.id, categoryId: catTelefon.id, taxRateId: kdv20.id, purchasePrice: 12000, salesPrice: 16999, minStockLevel: 8, averageCost: 12000 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P005', name: 'USB-C Hub 7 Port', unitId: unitAdet.id, categoryId: catElektronik.id, taxRateId: kdv20.id, purchasePrice: 280, salesPrice: 499, minStockLevel: 20, averageCost: 280 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P006', name: 'A4 Fotokopi Kağıdı (500 yaprak)', unitId: unitAdet.id, categoryId: catOfis.id, taxRateId: kdv10.id, purchasePrice: 85, salesPrice: 120, minStockLevel: 50, averageCost: 85 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P007', name: 'Tükenmez Kalem Seti (12li)', unitId: unitAdet.id, categoryId: catOfis.id, taxRateId: kdv10.id, purchasePrice: 45, salesPrice: 79, minStockLevel: 30, averageCost: 45 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P008', name: 'Monitör 27" 4K', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 7500, salesPrice: 10999, minStockLevel: 3, averageCost: 7500 } }),
  ]);

  // Stock levels
  const stockData = [
    { productId: products[0].id, qty: 12, locationId: locA1.id },
    { productId: products[1].id, qty: 45, locationId: locA1.id },
    { productId: products[2].id, qty: 38, locationId: locA2.id },
    { productId: products[3].id, qty: 7, locationId: locA2.id },
    { productId: products[4].id, qty: 62, locationId: locB1.id },
    { productId: products[5].id, qty: 3, locationId: locB1.id },
    { productId: products[6].id, qty: 28, locationId: locA1.id },
    { productId: products[7].id, qty: 2, locationId: locA2.id },
  ];

  for (const s of stockData) {
    await prisma.stockLevel.create({
      data: { tenantId: tenant.id, productId: s.productId, warehouseId: warehouse.id, locationId: s.locationId, quantity: s.qty },
    });
    await prisma.stockMovement.create({
      data: { tenantId: tenant.id, productId: s.productId, type: 'OPENING', quantity: s.qty, toWarehouseId: warehouse.id, notes: 'Açılış stoğu' },
    });
  }

  console.log('  ✓ Ürünler ve stok seviyeleri');

  // ── Contacts ──────────────────────────────────
  const contacts = await Promise.all([
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Teknoloji Çözümleri Ltd.', code: 'C001', taxNumber: '9876543210', taxOffice: 'Şişli', email: 'satin@teknolojicozmler.com', phone: '+90 212 444 0001', city: 'İstanbul', country: 'TR', creditLimit: 100000, paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Dijital Medya A.Ş.', code: 'C002', taxNumber: '1122334455', taxOffice: 'Beşiktaş', email: 'muhasebe@dijitalmedya.com', phone: '+90 212 444 0002', city: 'İstanbul', country: 'TR', creditLimit: 50000, paymentTermDays: 15 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Mavi Yazılım Koop.', code: 'C003', taxNumber: '5544332211', taxOffice: 'Ankara', email: 'finans@maviyazilim.com', phone: '+90 312 444 0003', city: 'Ankara', country: 'TR', paymentTermDays: 45 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Global Elektronik Dağıtım', code: 'S001', taxNumber: '6677889900', taxOffice: 'Ümraniye', email: 'satis@globalelektronik.com', phone: '+90 216 555 0010', city: 'İstanbul', country: 'TR', paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Ofis Dünyası Toptan', code: 'S002', taxNumber: '1029384756', taxOffice: 'Bağcılar', email: 'siparis@ofisdunyasi.com', phone: '+90 212 555 0020', city: 'İstanbul', country: 'TR', paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'BOTH', name: 'İnovasyon Teknoloji', code: 'B001', taxNumber: '9988776655', taxOffice: 'Maslak', email: 'info@inovasyon.tech', phone: '+90 212 555 0030', city: 'İstanbul', country: 'TR', creditLimit: 75000, paymentTermDays: 30 } }),
  ]);

  console.log('  ✓ Cari hesaplar');

  // ── Number Sequences ──────────────────────────
  const seqModules = ['invoice', 'sales_quote', 'sales_order', 'journal', 'stock_count'];
  const seqPrefixes: Record<string, string> = { invoice: 'INV-', sales_quote: 'TKL-', sales_order: 'SIP-', journal: 'JE-', stock_count: 'SC-' };

  for (const mod of seqModules) {
    await prisma.numberSequence.create({
      data: { tenantId: tenant.id, module: mod, prefix: seqPrefixes[mod] ?? '', lastNum: 0, padding: 6 },
    });
  }

  // ── Sales Quotes ──────────────────────────────
  const quote1 = await prisma.salesQuote.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, number: 'TKL-000001',
      date: new Date('2026-03-15'), validUntil: new Date('2026-04-15'),
      status: 'ACCEPTED', totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId: tenant.id, productId: products[2].id, description: 'Kablosuz Mouse', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ],
      },
    },
  });

  // ── Sales Orders ──────────────────────────────
  const order1 = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, quoteId: quote1.id,
      number: 'SIP-000001', date: new Date('2026-03-20'), dueDate: new Date('2026-04-20'),
      status: 'CONFIRMED', totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId: tenant.id, productId: products[2].id, description: 'Kablosuz Mouse', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ],
      },
    },
  });

  const order2 = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[1].id,
      number: 'SIP-000002', date: new Date('2026-03-25'), dueDate: new Date('2026-04-10'),
      status: 'DRAFT', totalNet: 6497, totalTax: 1299.4, totalGross: 7796.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[1].id, description: 'Mekanik Klavye', quantity: 5, unitPrice: 1299, discount: 0, taxRate: 20, taxAmount: 1299, lineTotal: 7794, sortOrder: 0 },
        ],
      },
    },
  });

  console.log('  ✓ Teklifler ve siparişler');

  // ── Invoices ──────────────────────────────────
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, salesOrderId: order1.id,
      type: 'SALES', status: 'PAID', number: 'INV-000001',
      date: new Date('2026-03-22'), dueDate: new Date('2026-04-22'),
      totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      lines: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId: tenant.id, productId: products[2].id, taxRateId: kdv20.id, description: 'Kablosuz Mouse', quantity: 2, unitPrice: 599, discount: 5, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ],
      },
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[1].id,
      type: 'SALES', status: 'SENT', number: 'INV-000002',
      date: new Date('2026-03-28'), dueDate: new Date('2026-04-12'),
      totalNet: 10832, totalTax: 2166.4, totalGross: 12998.4,
      lines: {
        create: [
          { tenantId: tenant.id, productId: products[3].id, taxRateId: kdv20.id, description: 'Akıllı Telefon X12', quantity: 1, unitPrice: 16999, discount: 0, taxAmount: 3399.8, lineTotal: 20398.8, sortOrder: 0 },
        ],
      },
    },
  });

  const inv3 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[2].id,
      type: 'SALES', status: 'OVERDUE', number: 'INV-000003',
      date: new Date('2026-02-15'), dueDate: new Date('2026-03-01'),
      totalNet: 4995, totalTax: 999, totalGross: 5994,
      lines: {
        create: [
          { tenantId: tenant.id, productId: products[4].id, taxRateId: kdv20.id, description: 'USB-C Hub 7 Port', quantity: 10, unitPrice: 499, discount: 0, taxAmount: 998, lineTotal: 5988, sortOrder: 0 },
        ],
      },
    },
  });

  const inv4 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[3].id,
      type: 'PURCHASE', status: 'PAID', number: 'INV-000004',
      date: new Date('2026-03-10'), dueDate: new Date('2026-05-10'),
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      lines: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, taxRateId: kdv20.id, description: 'Laptop Pro 15" (3 adet)', quantity: 3, unitPrice: 18000, discount: 0, taxAmount: 10800, lineTotal: 64800, sortOrder: 0 },
        ],
      },
    },
  });

  console.log('  ✓ Faturalar');

  // ── Bank & Cash Accounts ──────────────────────
  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId: tenant.id, name: 'Garanti Vadesiz TRY', bankName: 'Garanti BBVA', accountNumber: '1234567', iban: 'TR12 0006 2000 1234 5678 9012 34', currencyCode: 'TRY' },
  });

  const cashAccount = await prisma.cashAccount.create({
    data: { tenantId: tenant.id, name: 'Ana Kasa', currencyCode: 'TRY' },
  });

  // ── Payments ──────────────────────────────────
  const pay1 = await prisma.payment.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, bankAccountId: bankAccount.id,
      date: new Date('2026-03-25'), amount: 31556.4, method: 'BANK_TRANSFER',
      reference: 'EFT-2026-001', status: 'COMPLETED', notes: 'INV-000001 ödemesi',
    },
  });

  await prisma.paymentAllocation.create({
    data: { tenantId: tenant.id, paymentId: pay1.id, invoiceId: inv1.id, amount: 31556.4 },
  });

  const pay2 = await prisma.payment.create({
    data: {
      tenantId: tenant.id, contactId: contacts[3].id, bankAccountId: bankAccount.id,
      date: new Date('2026-03-12'), amount: 64800, method: 'BANK_TRANSFER',
      reference: 'EFT-2026-002', status: 'COMPLETED', notes: 'INV-000004 tedarikçi ödemesi',
    },
  });

  await prisma.paymentAllocation.create({
    data: { tenantId: tenant.id, paymentId: pay2.id, invoiceId: inv4.id, amount: 64800 },
  });

  console.log('  ✓ Banka hesapları ve ödemeler');

  // ── Account Entries (cari hesap hareketleri) ──
  await prisma.accountEntry.createMany({
    data: [
      { tenantId: tenant.id, contactId: contacts[0].id, date: new Date('2026-03-22'), debit: 31556.4, credit: 0, balance: 31556.4, description: 'INV-000001 fatura', refType: 'INVOICE', refId: inv1.id },
      { tenantId: tenant.id, contactId: contacts[0].id, date: new Date('2026-03-25'), debit: 0, credit: 31556.4, balance: 0, description: 'EFT-2026-001 ödeme', refType: 'PAYMENT', refId: pay1.id },
      { tenantId: tenant.id, contactId: contacts[1].id, date: new Date('2026-03-28'), debit: 12998.4, credit: 0, balance: 12998.4, description: 'INV-000002 fatura', refType: 'INVOICE', refId: inv2.id },
      { tenantId: tenant.id, contactId: contacts[2].id, date: new Date('2026-02-15'), debit: 5994, credit: 0, balance: 5994, description: 'INV-000003 fatura (gecikmiş)', refType: 'INVOICE', refId: inv3.id },
    ],
  });

  // ── Ledger Accounts ───────────────────────────
  const accounts = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '100', name: 'Kasa', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '102', name: 'Bankalar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '120', name: 'Alıcılar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '153', name: 'Ticari Mallar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '320', name: 'Satıcılar', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '391', name: 'Hesaplanan KDV', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '600', name: 'Yurt İçi Satışlar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '621', name: 'Satılan Ticari Mallar Maliyeti', accountType: 'EXPENSE' } }),
  ]);

  // ── Fiscal Period ─────────────────────────────
  const fiscalPeriod = await prisma.fiscalPeriod.create({
    data: { tenantId: tenant.id, name: '2026 Q1', startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'), status: 'OPEN' },
  });

  // ── Journal Entry ─────────────────────────────
  await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id, fiscalPeriodId: fiscalPeriod.id,
      type: 'AUTO_INVOICE', number: 'JE-000001',
      date: new Date('2026-03-22'), description: 'INV-000001 satış faturası kaydı',
      isPosted: true, postedAt: new Date('2026-03-22'),
      lines: {
        create: [
          { tenantId: tenant.id, accountId: accounts[2].id, debit: 31556.4, credit: 0, description: 'Alıcı borç', sortOrder: 0 },
          { tenantId: tenant.id, accountId: accounts[6].id, debit: 0, credit: 26297, description: 'Satış geliri', sortOrder: 1 },
          { tenantId: tenant.id, accountId: accounts[5].id, debit: 0, credit: 5259.4, description: 'Hesaplanan KDV', sortOrder: 2 },
        ],
      },
    },
  });

  console.log('  ✓ Cari hareketler, hesap planı, yevmiye');

  // ── Stock Count ───────────────────────────────
  await prisma.stockCount.create({
    data: {
      tenantId: tenant.id, warehouseId: warehouse.id,
      number: 'SC-000001', date: new Date('2026-03-31'),
      isFinalized: false, notes: 'Mart sonu sayımı',
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, expectedQty: 12, countedQty: 11, difference: -1 },
          { tenantId: tenant.id, productId: products[1].id, expectedQty: 45, countedQty: 45, difference: 0 },
          { tenantId: tenant.id, productId: products[2].id, expectedQty: 38, countedQty: 40, difference: 2 },
          { tenantId: tenant.id, productId: products[3].id, expectedQty: 7, countedQty: 7, difference: 0 },
        ],
      },
    },
  });

  console.log('  ✓ Stok sayımı');

  // ── Purchase Requests ─────────────────────────
  const purchaseReq1 = await prisma.purchaseRequest.create({
    data: {
      tenantId: tenant.id, number: 'PR-000001', date: new Date('2026-03-20'),
      status: 'ORDERED', notes: 'Mart ayı stok takviyesi',
      totalEstimated: 54000,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, quantity: 3, unitPrice: 18000 },
        ],
      },
    },
  });

  await prisma.purchaseRequest.create({
    data: {
      tenantId: tenant.id, number: 'PR-000002', date: new Date('2026-04-01'),
      status: 'APPROVED', notes: 'Ofis malzemeleri talebi',
      totalEstimated: 2550,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[5].id, quantity: 30, unitPrice: 85 },
        ],
      },
    },
  });

  await prisma.purchaseRequest.create({
    data: {
      tenantId: tenant.id, number: 'PR-000003', date: new Date('2026-04-03'),
      status: 'DRAFT', notes: 'Yeni dönem için elektronik alımı',
      totalEstimated: 36000,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[3].id, quantity: 2, unitPrice: 12000 },
          { tenantId: tenant.id, productId: products[4].id, quantity: 10, unitPrice: 280 },
          { tenantId: tenant.id, productId: products[7].id, quantity: 1, unitPrice: 7500 },
        ],
      },
    },
  });

  console.log('  ✓ Satın alma talepleri');

  // ── Purchase Orders ───────────────────────────
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[3].id, number: 'PO-000001',
      date: new Date('2026-03-22'), dueDate: new Date('2026-04-05'),
      status: 'RECEIVED', notes: 'Laptop stok takviyesi',
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 3, received: 3, unitPrice: 18000, taxRate: 20, taxAmount: 10800, lineTotal: 64800 },
        ],
      },
    },
  });

  await prisma.purchaseOrderHistory.createMany({
    data: [
      { tenantId: tenant.id, orderId: po1.id, toStatus: 'DRAFT', notes: 'Sipariş oluşturuldu' },
      { tenantId: tenant.id, orderId: po1.id, fromStatus: 'DRAFT', toStatus: 'SENT', notes: 'Tedarikçiye gönderildi' },
      { tenantId: tenant.id, orderId: po1.id, fromStatus: 'SENT', toStatus: 'RECEIVED', notes: '3 kalem teslim alındı' },
    ],
  });

  // Link PR-000001 to PO-000001
  await prisma.purchaseRequest.update({
    where: { id: purchaseReq1.id },
    data: { purchaseOrderId: po1.id },
  });

  const po2 = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[4].id, number: 'PO-000002',
      date: new Date('2026-04-01'), dueDate: new Date('2026-04-15'),
      status: 'SENT', notes: 'Ofis malzemeleri siparişi',
      totalNet: 4050, totalTax: 405, totalGross: 4455,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[5].id, description: 'A4 Fotokopi Kağıdı', quantity: 30, received: 0, unitPrice: 85, taxRate: 10, taxAmount: 255, lineTotal: 2805 },
          { tenantId: tenant.id, productId: products[6].id, description: 'Tükenmez Kalem Seti', quantity: 20, received: 0, unitPrice: 45, taxRate: 10, taxAmount: 90, lineTotal: 990 },
        ],
      },
    },
  });

  await prisma.purchaseOrderHistory.createMany({
    data: [
      { tenantId: tenant.id, orderId: po2.id, toStatus: 'DRAFT' },
      { tenantId: tenant.id, orderId: po2.id, fromStatus: 'DRAFT', toStatus: 'SENT' },
    ],
  });

  const po3 = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[3].id, number: 'PO-000003',
      date: new Date('2026-04-03'),
      status: 'DRAFT', notes: 'Monitör siparişi (taslak)',
      totalNet: 15000, totalTax: 3000, totalGross: 18000,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[7].id, description: 'Monitör 27" 4K', quantity: 2, received: 0, unitPrice: 7500, taxRate: 20, taxAmount: 3000, lineTotal: 18000 },
        ],
      },
    },
  });

  await prisma.purchaseOrderHistory.create({
    data: { tenantId: tenant.id, orderId: po3.id, toStatus: 'DRAFT' },
  });

  console.log('  ✓ Satın alma siparişleri');

  // ── Number Sequences for Purchase ─────────────
  await prisma.numberSequence.createMany({
    data: [
      { tenantId: tenant.id, module: 'purchase_request', prefix: 'PR-', lastNum: 3, padding: 6 },
      { tenantId: tenant.id, module: 'purchase_order', prefix: 'PO-', lastNum: 3, padding: 6 },
    ],
    skipDuplicates: true,
  });

  // ── Roles & Permissions ───────────────────────
  const roleAdmin = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'Yönetici', description: 'Tam yetkili yönetici', isSystem: true },
  });
  const roleAccountant = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'Muhasebeci', description: 'Muhasebe ve fatura işlemleri', isSystem: true },
  });
  const roleSales = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'Satış Temsilcisi', description: 'Satış ve teklif işlemleri', isSystem: true },
  });

  // Admin — tüm modüllere tam yetki
  const adminModules = ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting'];
  const adminActions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'] as const;
  for (const mod of adminModules) {
    for (const action of adminActions) {
      await prisma.rolePermission.create({ data: { roleId: roleAdmin.id, module: mod, action } });
    }
  }

  // Muhasebeci — accounting + invoicing okuma/yazma
  for (const mod of ['accounting', 'invoicing']) {
    for (const action of ['CREATE', 'READ', 'UPDATE'] as const) {
      await prisma.rolePermission.create({ data: { roleId: roleAccountant.id, module: mod, action } });
    }
  }
  await prisma.rolePermission.create({ data: { roleId: roleAccountant.id, module: 'reporting', action: 'READ' } });

  // Satış — contacts + invoicing + reporting okuma/yazma
  for (const mod of ['contacts', 'invoicing']) {
    for (const action of ['CREATE', 'READ', 'UPDATE'] as const) {
      await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: mod, action } });
    }
  }
  await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: 'reporting', action: 'READ' } });
  await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: 'inventory', action: 'READ' } });

  // Owner kullanıcıya admin rolü ata
  await prisma.tenantUser.update({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    data: { roleId: roleAdmin.id },
  });

  console.log('  ✓ Roller ve yetkiler');

  // ── Tenant Settings ───────────────────────────
  await prisma.tenantSetting.createMany({
    data: [
      { tenantId: tenant.id, key: 'default_currency', value: 'TRY' },
      { tenantId: tenant.id, key: 'invoice_prefix', value: 'INV' },
      { tenantId: tenant.id, key: 'date_format', value: 'DD.MM.YYYY' },
      { tenantId: tenant.id, key: 'timezone', value: 'Europe/Istanbul' },
      { tenantId: tenant.id, key: 'language', value: 'tr' },
    ],
  });

  // Module Settings
  await prisma.moduleSetting.createMany({
    data: [
      { tenantId: tenant.id, module: 'accounting', key: 'default_vat_rate', value: '20' },
      { tenantId: tenant.id, module: 'accounting', key: 'fiscal_year_start', value: '01-01' },
      { tenantId: tenant.id, module: 'inventory', key: 'costing_method', value: 'MOVING_AVERAGE' },
      { tenantId: tenant.id, module: 'inventory', key: 'low_stock_alert', value: 'true' },
      { tenantId: tenant.id, module: 'invoicing', key: 'payment_terms_days', value: '30' },
      { tenantId: tenant.id, module: 'invoicing', key: 'auto_invoice_number', value: 'true' },
    ],
  });

  console.log('  ✓ Tenant ve modül ayarları');

  // ── Bank Transactions ─────────────────────────
  const bankAccount2 = await prisma.bankAccount.findFirst({ where: { tenantId: tenant.id } });
  if (bankAccount2) {
    await prisma.bankTransaction.createMany({
      data: [
        { tenantId: tenant.id, bankAccountId: bankAccount2.id, type: 'DEPOSIT', amount: 31556.4, balanceAfter: 31556.4, date: new Date('2026-03-25'), description: 'Teknoloji Çözümleri Ltd. tahsilat', reference: 'EFT-2026-001' },
        { tenantId: tenant.id, bankAccountId: bankAccount2.id, type: 'WITHDRAWAL', amount: 64800, balanceAfter: -33243.6, date: new Date('2026-03-12'), description: 'Global Elektronik ödeme', reference: 'EFT-2026-002' },
        { tenantId: tenant.id, bankAccountId: bankAccount2.id, type: 'DEPOSIT', amount: 50000, balanceAfter: 16756.4, date: new Date('2026-03-01'), description: 'Sermaye girişi', reference: 'SERMAYE-001' },
      ],
    });
    console.log('  ✓ Banka hareketleri');
  }

  // ── Saved Reports ─────────────────────────────
  await prisma.savedReport.createMany({
    data: [
      { tenantId: tenant.id, name: 'Mart 2026 Gelir Özeti', module: 'reporting', filters: { dateFrom: '2026-03-01', dateTo: '2026-03-31' }, columns: ['number', 'contact', 'date', 'totalGross'], isShared: true, createdBy: user.id },
      { tenantId: tenant.id, name: 'Kritik Stok Raporu', module: 'reporting', filters: { belowMin: true }, columns: ['productCode', 'productName', 'quantity', 'minStockLevel'], isShared: false, createdBy: user.id },
      { tenantId: tenant.id, name: 'Gecikmiş Faturalar', module: 'reporting', filters: { status: 'OVERDUE' }, columns: ['number', 'contact', 'dueDate', 'totalGross'], isShared: true, createdBy: user.id },
    ],
  });

  console.log('  ✓ Kayıtlı raporlar');

  // ── Notifications ─────────────────────────────
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: user.id, title: 'Kritik Stok Uyarısı', message: 'A4 Fotokopi Kağıdı stoku minimum seviyenin altına düştü (3 adet).', module: 'inventory', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user.id, title: 'Gecikmiş Fatura', message: 'INV-000003 numaralı fatura vadesi geçti. Mavi Yazılım Koop. - ₺5.994,00', module: 'invoicing', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user.id, title: 'Yeni Ödeme Alındı', message: 'Teknoloji Çözümleri Ltd. tarafından ₺31.556,40 ödeme alındı.', module: 'accounting', status: 'READ', readAt: new Date('2026-03-25') },
    ],
  });

  console.log('  ✓ Bildirimler');

  // ── Audit Logs ────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { tenantId: tenant.id, userId: user.id, module: 'invoicing', entityType: 'INVOICE', entityId: 'INV-000001', action: 'CREATE', ipAddress: '127.0.0.1' },
      { tenantId: tenant.id, userId: user.id, module: 'invoicing', entityType: 'INVOICE', entityId: 'INV-000002', action: 'CREATE', ipAddress: '127.0.0.1' },
      { tenantId: tenant.id, userId: user.id, module: 'contacts', entityType: 'CONTACT', entityId: 'C001', action: 'CREATE', ipAddress: '127.0.0.1' },
      { tenantId: tenant.id, userId: user.id, module: 'inventory', entityType: 'PRODUCT', entityId: 'P001', action: 'CREATE', ipAddress: '127.0.0.1' },
      { tenantId: tenant.id, userId: user.id, module: 'accounting', entityType: 'INVOICE', entityId: 'INV-000001', action: 'APPROVE', ipAddress: '127.0.0.1' },
    ],
  });

  console.log('  ✓ Audit logları');

  // ── Currency Rates ────────────────────────────
  const today = new Date('2026-04-04');
  await prisma.currencyRate.createMany({
    data: [
      { tenantId: tenant.id, currencyCode: 'USD', rate: 32.45, date: today, source: 'MANUAL' },
      { tenantId: tenant.id, currencyCode: 'EUR', rate: 35.18, date: today, source: 'MANUAL' },
      { tenantId: tenant.id, currencyCode: 'USD', rate: 32.30, date: new Date('2026-04-03'), source: 'MANUAL' },
      { tenantId: tenant.id, currencyCode: 'EUR', rate: 35.05, date: new Date('2026-04-03'), source: 'MANUAL' },
      { tenantId: tenant.id, currencyCode: 'USD', rate: 32.10, date: new Date('2026-04-02'), source: 'MANUAL' },
      { tenantId: tenant.id, currencyCode: 'EUR', rate: 34.90, date: new Date('2026-04-02'), source: 'MANUAL' },
    ],
  });
  console.log('  ✓ Döviz kurları');

  // ── Stock Valuations ──────────────────────────
  await prisma.stockValuation.createMany({
    data: [
      { tenantId: tenant.id, productId: products[0].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 12, qtyOut: 0, qtyBalance: 12, unitCost: 18000, totalValue: 216000 },
      { tenantId: tenant.id, productId: products[1].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 45, qtyOut: 0, qtyBalance: 45, unitCost: 800, totalValue: 36000 },
      { tenantId: tenant.id, productId: products[2].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 38, qtyOut: 0, qtyBalance: 38, unitCost: 350, totalValue: 13300 },
      { tenantId: tenant.id, productId: products[3].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 7, qtyOut: 0, qtyBalance: 7, unitCost: 12000, totalValue: 84000 },
      { tenantId: tenant.id, productId: products[4].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 62, qtyOut: 0, qtyBalance: 62, unitCost: 280, totalValue: 17360 },
      { tenantId: tenant.id, productId: products[5].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 3, qtyOut: 0, qtyBalance: 3, unitCost: 85, totalValue: 255 },
      { tenantId: tenant.id, productId: products[6].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 28, qtyOut: 0, qtyBalance: 28, unitCost: 45, totalValue: 1260 },
      { tenantId: tenant.id, productId: products[7].id, warehouseId: warehouse.id, date: new Date('2026-03-01'), qtyIn: 2, qtyOut: 0, qtyBalance: 2, unitCost: 7500, totalValue: 15000 },
    ],
  });
  console.log('  ✓ Stok değerlemeleri');

  // ── Inventory Reservations ────────────────────
  // SIP-000001 için laptop ve mouse rezervasyonu
  const salesOrder1 = await prisma.salesOrder.findFirst({ where: { tenantId: tenant.id, number: 'SIP-000001' } });
  if (salesOrder1) {
    await prisma.inventoryReservation.createMany({
      data: [
        { tenantId: tenant.id, productId: products[0].id, warehouseId: warehouse.id, quantity: 1, refType: 'SALES_ORDER', refId: salesOrder1.id, notes: 'SIP-000001 için rezerve' },
        { tenantId: tenant.id, productId: products[2].id, warehouseId: warehouse.id, quantity: 2, refType: 'SALES_ORDER', refId: salesOrder1.id, notes: 'SIP-000001 için rezerve' },
      ],
    });
  }
  console.log('  ✓ Stok rezervasyonları');

  // ── Product Batches ───────────────────────────
  await prisma.productBatch.createMany({
    data: [
      { tenantId: tenant.id, productId: products[0].id, batchNumber: 'BATCH-LP-2026-01', manufacturedAt: new Date('2026-01-15'), quantity: 12, notes: 'İlk parti laptop' },
      { tenantId: tenant.id, productId: products[3].id, batchNumber: 'BATCH-TEL-2026-01', manufacturedAt: new Date('2026-02-01'), expiryDate: new Date('2028-02-01'), quantity: 7, notes: 'Telefon partisi' },
      { tenantId: tenant.id, productId: products[5].id, batchNumber: 'BATCH-KAG-2026-01', manufacturedAt: new Date('2026-01-01'), expiryDate: new Date('2027-01-01'), quantity: 3, notes: 'Kağıt partisi' },
    ],
  });
  console.log('  ✓ Ürün partileri');

  // ── Sales Order History ───────────────────────
  const so1 = await prisma.salesOrder.findFirst({ where: { tenantId: tenant.id, number: 'SIP-000001' } });
  const so2 = await prisma.salesOrder.findFirst({ where: { tenantId: tenant.id, number: 'SIP-000002' } });
  if (so1) {
    await prisma.salesOrderHistory.createMany({
      data: [
        { tenantId: tenant.id, orderId: so1.id, fromStatus: null, toStatus: 'DRAFT', notes: 'Sipariş oluşturuldu', createdById: user.id },
        { tenantId: tenant.id, orderId: so1.id, fromStatus: 'DRAFT', toStatus: 'CONFIRMED', notes: 'Müşteri onayı alındı', createdById: user.id },
      ],
    });
  }
  if (so2) {
    await prisma.salesOrderHistory.create({
      data: { tenantId: tenant.id, orderId: so2.id, fromStatus: null, toStatus: 'DRAFT', notes: 'Sipariş oluşturuldu', createdById: user.id },
    });
  }
  console.log('  ✓ Sipariş geçmişi');

  // ── Invoice History ───────────────────────────
  const inv1Rec = await prisma.invoice.findFirst({ where: { tenantId: tenant.id, number: 'INV-000001' } });
  const inv2Rec = await prisma.invoice.findFirst({ where: { tenantId: tenant.id, number: 'INV-000002' } });
  const inv3Rec = await prisma.invoice.findFirst({ where: { tenantId: tenant.id, number: 'INV-000003' } });
  if (inv1Rec) {
    await prisma.invoiceHistory.createMany({
      data: [
        { tenantId: tenant.id, invoiceId: inv1Rec.id, fromStatus: null, toStatus: 'DRAFT', createdById: user.id },
        { tenantId: tenant.id, invoiceId: inv1Rec.id, fromStatus: 'DRAFT', toStatus: 'SENT', createdById: user.id },
        { tenantId: tenant.id, invoiceId: inv1Rec.id, fromStatus: 'SENT', toStatus: 'PAID', notes: 'Ödeme alındı', createdById: user.id },
      ],
    });
  }
  if (inv2Rec) {
    await prisma.invoiceHistory.createMany({
      data: [
        { tenantId: tenant.id, invoiceId: inv2Rec.id, fromStatus: null, toStatus: 'DRAFT', createdById: user.id },
        { tenantId: tenant.id, invoiceId: inv2Rec.id, fromStatus: 'DRAFT', toStatus: 'SENT', createdById: user.id },
      ],
    });
  }
  if (inv3Rec) {
    await prisma.invoiceHistory.createMany({
      data: [
        { tenantId: tenant.id, invoiceId: inv3Rec.id, fromStatus: null, toStatus: 'DRAFT', createdById: user.id },
        { tenantId: tenant.id, invoiceId: inv3Rec.id, fromStatus: 'DRAFT', toStatus: 'SENT', createdById: user.id },
        { tenantId: tenant.id, invoiceId: inv3Rec.id, fromStatus: 'SENT', toStatus: 'OVERDUE', notes: 'Vade geçti', createdById: user.id },
      ],
    });
  }
  console.log('  ✓ Fatura geçmişi');

  // ── Delivery Notes ────────────────────────────
  if (so1 && inv1Rec) {
    const dn = await prisma.deliveryNote.create({
      data: {
        tenantId: tenant.id, number: 'IRS-000001',
        type: 'OUTBOUND', status: 'DELIVERED',
        salesOrderId: so1.id, contactId: contacts[0].id,
        warehouseId: warehouse.id,
        date: new Date('2026-03-23'),
        shippedAt: new Date('2026-03-23'),
        deliveredAt: new Date('2026-03-24'),
        trackingNumber: 'TRK-2026-001',
        carrier: 'Yurtiçi Kargo',
        notes: 'SIP-000001 teslimatı',
      },
    });

    await prisma.deliveryNoteItem.createMany({
      data: [
        { tenantId: tenant.id, deliveryNoteId: dn.id, productId: products[0].id, description: 'Laptop Pro 15"', orderedQty: 1, deliveredQty: 1, sortOrder: 0 },
        { tenantId: tenant.id, deliveryNoteId: dn.id, productId: products[2].id, description: 'Kablosuz Mouse', orderedQty: 2, deliveredQty: 2, sortOrder: 1 },
      ],
    });
    console.log('  ✓ İrsaliye ve kalemler');
  }

  // ── Reconciliation ────────────────────────────
  const bankAcc = await prisma.bankAccount.findFirst({ where: { tenantId: tenant.id } });
  const ledgerBank = await prisma.ledgerAccount.findFirst({ where: { tenantId: tenant.id, code: '102' } });
  if (bankAcc && ledgerBank) {
    const recon = await prisma.reconciliation.create({
      data: {
        tenantId: tenant.id, name: 'Mart 2026 Banka Mutabakatı',
        description: 'Garanti Vadesiz hesap mutabakatı',
        date: new Date('2026-03-31'), isFinalized: false,
      },
    });
    await prisma.reconciliationLine.createMany({
      data: [
        { tenantId: tenant.id, reconciliationId: recon.id, accountId: ledgerBank.id, refType: 'PAYMENT', refId: 'EFT-2026-001', amount: 31556.4, isMatched: true, notes: 'Teknoloji Çözümleri tahsilat' },
        { tenantId: tenant.id, reconciliationId: recon.id, accountId: ledgerBank.id, refType: 'PAYMENT', refId: 'EFT-2026-002', amount: -64800, isMatched: true, notes: 'Global Elektronik ödeme' },
        { tenantId: tenant.id, reconciliationId: recon.id, accountId: ledgerBank.id, refType: 'DEPOSIT', refId: 'SERMAYE-001', amount: 50000, isMatched: false, notes: 'Sermaye girişi - eşleşme bekliyor' },
      ],
    });
    console.log('  ✓ Banka mutabakatı');
  }

  // ── Tenant Feature Overrides ──────────────────
  // Demo için MAX_PRODUCTS limitini 1000'e çıkar
  await prisma.tenantFeatureOverride.create({
    data: {
      tenantId: tenant.id, featureKey: 'MAX_PRODUCTS', value: '1000',
      isEnabled: true, reason: 'Demo hesabı için genişletilmiş limit',
      expiresAt: new Date('2026-12-31'),
    },
  });
  console.log('  ✓ Feature override (demo limit)');

  // ── Summary ───────────────────────────────────
  console.log('\n✅ Seed tamamlandı!\n');
  console.log('  Giriş bilgileri:');
  console.log('  ─────────────────────────────');
  console.log('  E-posta  : admin@axondemo.com');
  console.log('  Şifre    : demo1234');
  console.log('  Tenant   : axon-demo');
  console.log('  ─────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
