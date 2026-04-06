import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed basliyor...');

  // -- Admin User --
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: {
      email: 'admin@axonerp.com',
      name: 'Platform Admin',
      password: await bcrypt.hash('admin1234', 10),
      isActive: true,
    },
  });
  console.log('  + Admin kullanici (admin@axonerp.com / admin1234)');

  // -- Cleanup --
  // -- Cleanup --
  await prisma.savedReport.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalFlow.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.lotSerialNumber.deleteMany();
  await prisma.eDocument.deleteMany();
  await prisma.checkPromissoryNote.deleteMany();
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
  // Marketplace
  await prisma.marketplaceOrderItem.deleteMany();
  await prisma.marketplaceOrder.deleteMany();
  await prisma.marketplaceListing.deleteMany();
  await prisma.marketplaceIntegration.deleteMany();
  // Service
  await prisma.serviceActivity.deleteMany();
  await prisma.serviceRequestHistory.deleteMany();
  await prisma.serviceRequestItem.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.customerAsset.deleteMany();
  // Production
  await prisma.workOrderHistory.deleteMany();
  await prisma.workOrderOperation.deleteMany();
  await prisma.workOrderItem.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.routingOperation.deleteMany();
  await prisma.bOMItem.deleteMany();
  await prisma.bOM.deleteMany();
  await prisma.workCenter.deleteMany();
  // HR & Payroll
  await prisma.payrollItem.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.employee.deleteMany();
  // Finance
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
  await prisma.stockCountItem.deleteMany();
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
  console.log('  + Eski veriler temizlendi');

  // -- Tenant (Starter) --
  const tenant = await prisma.tenant.create({
    data: {
      slug: 'axon-demo',
      companyName: 'Axon Demo A.S.',
      taxNumber: '1234567890',
      taxOffice: 'Kadikoy',
      email: 'info@axondemo.com',
      phone: '+90 212 555 0100',
      address: 'Bagdat Caddesi No:42',
      city: 'Istanbul',
      country: 'TR',
      sector: 'Teknoloji',
      plan: 'STARTER',
      status: 'ACTIVE',
      modules: ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting'],
    },
  });
  console.log('  + Tenant: ' + tenant.companyName);

  // -- User --
  const hashedPassword = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.create({
    data: {
      email: 'admin@axondemo.com',
      name: 'Ahmet Yilmaz',
      phone: '+90 532 555 0101',
      password: hashedPassword,
      isActive: true,
    },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: user.id, isOwner: true, isActive: true },
  });
  console.log('  + Kullanici: admin@axondemo.com / demo1234');

  // -- Plan Features --
  const planFeatures = [
    { plan: 'STARTER' as const, key: 'max_users', featureKey: 'MAX_USERS' as const, value: '5', type: 'LIMIT' as const },
    { plan: 'STARTER' as const, key: 'max_products', featureKey: 'MAX_PRODUCTS' as const, value: '500', type: 'LIMIT' as const },
    { plan: 'STARTER' as const, key: 'multi_warehouse', featureKey: 'MULTI_WAREHOUSE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'role_management', featureKey: 'ROLE_MANAGEMENT' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'approvals', featureKey: 'APPROVALS' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'crm', featureKey: 'CRM' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'sales', featureKey: 'SALES' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'purchasing', featureKey: 'PURCHASING' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'production', featureKey: 'PRODUCTION' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'service', featureKey: 'SERVICE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'marketplace', featureKey: 'MARKETPLACE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'payroll', featureKey: 'PAYROLL' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'hr', featureKey: 'HR' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'api_access', featureKey: 'API_ACCESS' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'STARTER' as const, key: 'audit_log', featureKey: 'AUDIT_LOG' as const, value: 'basic', type: 'ENUM' as const },
    { plan: 'STARTER' as const, key: 'custom_reporting', featureKey: 'CUSTOM_REPORTING' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'max_users', featureKey: 'MAX_USERS' as const, value: '25', type: 'LIMIT' as const },
    { plan: 'PROFESSIONAL' as const, key: 'max_products', featureKey: 'MAX_PRODUCTS' as const, value: '5000', type: 'LIMIT' as const },
    { plan: 'PROFESSIONAL' as const, key: 'multi_warehouse', featureKey: 'MULTI_WAREHOUSE' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'role_management', featureKey: 'ROLE_MANAGEMENT' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'approvals', featureKey: 'APPROVALS' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'crm', featureKey: 'CRM' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'sales', featureKey: 'SALES' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'purchasing', featureKey: 'PURCHASING' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'production', featureKey: 'PRODUCTION' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'service', featureKey: 'SERVICE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'marketplace', featureKey: 'MARKETPLACE' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'payroll', featureKey: 'PAYROLL' as const, value: 'false', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'hr', featureKey: 'HR' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'api_access', featureKey: 'API_ACCESS' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'PROFESSIONAL' as const, key: 'audit_log', featureKey: 'AUDIT_LOG' as const, value: 'standard', type: 'ENUM' as const },
    { plan: 'PROFESSIONAL' as const, key: 'custom_reporting', featureKey: 'CUSTOM_REPORTING' as const, value: 'true', type: 'BOOLEAN' as const },
    // Enterprise
    { plan: 'ENTERPRISE' as const, key: 'max_users', featureKey: 'MAX_USERS' as const, value: 'unlimited', type: 'LIMIT' as const },
    { plan: 'ENTERPRISE' as const, key: 'max_products', featureKey: 'MAX_PRODUCTS' as const, value: 'unlimited', type: 'LIMIT' as const },
    { plan: 'ENTERPRISE' as const, key: 'multi_warehouse', featureKey: 'MULTI_WAREHOUSE' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'role_management', featureKey: 'ROLE_MANAGEMENT' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'approvals', featureKey: 'APPROVALS' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'crm', featureKey: 'CRM' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'sales', featureKey: 'SALES' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'purchasing', featureKey: 'PURCHASING' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'production', featureKey: 'PRODUCTION' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'service', featureKey: 'SERVICE' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'marketplace', featureKey: 'MARKETPLACE' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'payroll', featureKey: 'PAYROLL' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'hr', featureKey: 'HR' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'api_access', featureKey: 'API_ACCESS' as const, value: 'true', type: 'BOOLEAN' as const },
    { plan: 'ENTERPRISE' as const, key: 'audit_log', featureKey: 'AUDIT_LOG' as const, value: 'full', type: 'ENUM' as const },
    { plan: 'ENTERPRISE' as const, key: 'custom_reporting', featureKey: 'CUSTOM_REPORTING' as const, value: 'true', type: 'BOOLEAN' as const },
  ];
  for (const pf of planFeatures) {
    await prisma.planFeature.upsert({
      where: { plan_key: { plan: pf.plan, key: pf.key } },
      create: pf,
      update: { value: pf.value },
    });
  }
  console.log('  + Plan features');

  // -- Master Data --
  const [unitAdet, unitKg, unitLt, unitMt] = await Promise.all([
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Adet', code: 'AD' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Kilogram', code: 'KG' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Litre', code: 'LT' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Metre', code: 'MT' } }),
  ]);
  const catElektronik = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Elektronik' } });
  const catBilgisayar = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Bilgisayar', parentId: catElektronik.id } });
  const catTelefon = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Telefon', parentId: catElektronik.id } });
  const catOfis = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Ofis Malzemeleri' } });
  const [kdv0, kdv10, kdv20] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %0', rate: 0 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %10', rate: 10 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %20', rate: 20 } }),
  ]);
  await Promise.all([
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'TRY', name: 'Turk Lirasi', symbol: 'TL', defaultRate: 1, isBase: true } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'USD', name: 'Amerikan Dolari', symbol: '$', defaultRate: 32.5 } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'EUR', name: 'Euro', symbol: 'E', defaultRate: 35.2 } }),
  ]);
  console.log('  + Master data (birim, kategori, KDV, doviz)');

  // -- Warehouse --
  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: 'Ana Depo', code: 'WH01', address: 'Dudullu OSB, Istanbul' },
  });
  const [locA1, locA2, locB1] = await Promise.all([
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf A-1', code: 'A-1' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf A-2', code: 'A-2' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, name: 'Raf B-1', code: 'B-1' } }),
  ]);
  console.log('  + Depo ve lokasyonlar');

  // -- Products --
  const products = await Promise.all([
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P001', name: 'Laptop Pro 15"', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 18000, salesPrice: 24999, minStockLevel: 5, averageCost: 18000 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P002', name: 'Mekanik Klavye', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 800, salesPrice: 1299, minStockLevel: 10, averageCost: 800 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P003', name: 'Kablosuz Mouse', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 350, salesPrice: 599, minStockLevel: 15, averageCost: 350 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P004', name: 'Akilli Telefon X12', unitId: unitAdet.id, categoryId: catTelefon.id, taxRateId: kdv20.id, purchasePrice: 12000, salesPrice: 16999, minStockLevel: 8, averageCost: 12000 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P005', name: 'USB-C Hub 7 Port', unitId: unitAdet.id, categoryId: catElektronik.id, taxRateId: kdv20.id, purchasePrice: 280, salesPrice: 499, minStockLevel: 20, averageCost: 280 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P006', name: 'A4 Fotokopi Kagidi (500 yaprak)', unitId: unitAdet.id, categoryId: catOfis.id, taxRateId: kdv10.id, purchasePrice: 85, salesPrice: 120, minStockLevel: 50, averageCost: 85 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P007', name: 'Tukenmez Kalem Seti (12li)', unitId: unitAdet.id, categoryId: catOfis.id, taxRateId: kdv10.id, purchasePrice: 45, salesPrice: 79, minStockLevel: 30, averageCost: 45 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P008', name: 'Monitor 27" 4K', unitId: unitAdet.id, categoryId: catBilgisayar.id, taxRateId: kdv20.id, purchasePrice: 7500, salesPrice: 10999, minStockLevel: 3, averageCost: 7500 } }),
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
    await prisma.stockLevel.create({ data: { tenantId: tenant.id, productId: s.productId, warehouseId: warehouse.id, locationId: s.locationId, quantity: s.qty } });
    await prisma.stockMovement.create({ data: { tenantId: tenant.id, productId: s.productId, type: 'OPENING', quantity: s.qty, toWarehouseId: warehouse.id, notes: 'Acilis stogu' } });
  }
  console.log('  + Urunler ve stok seviyeleri');

  // -- Contacts --
  const contacts = await Promise.all([
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Teknoloji Cozumleri Ltd.', code: 'C001', taxNumber: '9876543210', taxOffice: 'Sisli', email: 'satin@teknolojicozmler.com', phone: '+90 212 444 0001', city: 'Istanbul', country: 'TR', creditLimit: 100000, paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Dijital Medya A.S.', code: 'C002', taxNumber: '1122334455', taxOffice: 'Besiktas', email: 'muhasebe@dijitalmedya.com', phone: '+90 212 444 0002', city: 'Istanbul', country: 'TR', creditLimit: 50000, paymentTermDays: 15 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Mavi Yazilim Koop.', code: 'C003', taxNumber: '5544332211', taxOffice: 'Ankara', email: 'finans@maviyazilim.com', phone: '+90 312 444 0003', city: 'Ankara', country: 'TR', paymentTermDays: 45 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Global Elektronik Dagitim', code: 'S001', taxNumber: '6677889900', taxOffice: 'Umraniye', email: 'satis@globalelektronik.com', phone: '+90 216 555 0010', city: 'Istanbul', country: 'TR', paymentTermDays: 60 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Ofis Dunyasi Toptan', code: 'S002', taxNumber: '1029384756', taxOffice: 'Bagcilar', email: 'siparis@ofisdunyasi.com', phone: '+90 212 555 0020', city: 'Istanbul', country: 'TR', paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'BOTH', name: 'Inovasyon Teknoloji', code: 'B001', taxNumber: '9988776655', taxOffice: 'Maslak', email: 'info@inovasyon.tech', phone: '+90 212 555 0030', city: 'Istanbul', country: 'TR', creditLimit: 75000, paymentTermDays: 30 } }),
  ]);
  console.log('  + Cari hesaplar');

  // -- Number Sequences --
  for (const mod of ['invoice', 'sales_quote', 'sales_order', 'journal', 'stock_count']) {
    const prefixes: Record<string, string> = { invoice: 'INV-', sales_quote: 'TKL-', sales_order: 'SIP-', journal: 'JE-', stock_count: 'SC-' };
    await prisma.numberSequence.create({ data: { tenantId: tenant.id, module: mod, prefix: prefixes[mod] ?? '', lastNum: 0, padding: 6 } });
  }

  // -- Sales Quotes --
  const quote1 = await prisma.salesQuote.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, number: 'TKL-000001',
      date: new Date('2026-03-15'), validUntil: new Date('2026-04-15'),
      status: 'ACCEPTED', totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId: tenant.id, productId: products[2].id, description: 'Kablosuz Mouse', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ]
      },
    },
  });

  // -- Sales Orders --
  const order1 = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, quoteId: quote1.id,
      number: 'SIP-000001', date: new Date('2026-03-20'), dueDate: new Date('2026-04-20'),
      status: 'CONFIRMED', totalNet: 26297, totalTax: 5259.4, totalGross: 31556.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 1, unitPrice: 24999, discount: 0, taxRate: 20, taxAmount: 4999.8, lineTotal: 29998.8, sortOrder: 0 },
          { tenantId: tenant.id, productId: products[2].id, description: 'Kablosuz Mouse', quantity: 2, unitPrice: 599, discount: 5, taxRate: 20, taxAmount: 114.24, lineTotal: 1251.24, sortOrder: 1 },
        ]
      },
    },
  });
  await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[1].id,
      number: 'SIP-000002', date: new Date('2026-03-25'), dueDate: new Date('2026-04-10'),
      status: 'DRAFT', totalNet: 6497, totalTax: 1299.4, totalGross: 7796.4,
      items: {
        create: [
          { tenantId: tenant.id, productId: products[1].id, description: 'Mekanik Klavye', quantity: 5, unitPrice: 1299, discount: 0, taxRate: 20, taxAmount: 1299, lineTotal: 7794, sortOrder: 0 },
        ]
      },
    },
  });
  console.log('  + Teklifler ve siparisler');

  // -- Invoices --
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
        ]
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
          { tenantId: tenant.id, productId: products[3].id, taxRateId: kdv20.id, description: 'Akilli Telefon X12', quantity: 1, unitPrice: 16999, discount: 0, taxAmount: 3399.8, lineTotal: 20398.8, sortOrder: 0 },
        ]
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
        ]
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
        ]
      },
    },
  });
  console.log('  + Faturalar');

  // -- Bank & Cash --
  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId: tenant.id, name: 'Garanti Vadesiz TRY', bankName: 'Garanti BBVA', accountNumber: '1234567', iban: 'TR12 0006 2000 1234 5678 9012 34', currencyCode: 'TRY' },
  });
  await prisma.cashAccount.create({ data: { tenantId: tenant.id, name: 'Ana Kasa', currencyCode: 'TRY' } });

  // -- Payments --
  const pay1 = await prisma.payment.create({
    data: { tenantId: tenant.id, contactId: contacts[0].id, bankAccountId: bankAccount.id, date: new Date('2026-03-25'), amount: 31556.4, method: 'BANK_TRANSFER', reference: 'EFT-2026-001', status: 'COMPLETED', notes: 'INV-000001 odemesi' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: pay1.id, invoiceId: inv1.id, amount: 31556.4 } });
  const pay2 = await prisma.payment.create({
    data: { tenantId: tenant.id, contactId: contacts[3].id, bankAccountId: bankAccount.id, date: new Date('2026-03-12'), amount: 64800, method: 'BANK_TRANSFER', reference: 'EFT-2026-002', status: 'COMPLETED', notes: 'INV-000004 tedarikci odemesi' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: pay2.id, invoiceId: inv4.id, amount: 64800 } });
  console.log('  + Banka hesaplari ve odemeler');

  // -- Account Entries --
  await prisma.accountEntry.createMany({
    data: [
      { tenantId: tenant.id, contactId: contacts[0].id, date: new Date('2026-03-22'), debit: 31556.4, credit: 0, balance: 31556.4, description: 'INV-000001 fatura', refType: 'INVOICE', refId: inv1.id },
      { tenantId: tenant.id, contactId: contacts[0].id, date: new Date('2026-03-25'), debit: 0, credit: 31556.4, balance: 0, description: 'EFT-2026-001 odeme', refType: 'PAYMENT', refId: pay1.id },
      { tenantId: tenant.id, contactId: contacts[1].id, date: new Date('2026-03-28'), debit: 12998.4, credit: 0, balance: 12998.4, description: 'INV-000002 fatura', refType: 'INVOICE', refId: inv2.id },
      { tenantId: tenant.id, contactId: contacts[2].id, date: new Date('2026-02-15'), debit: 5994, credit: 0, balance: 5994, description: 'INV-000003 fatura (gecikmis)', refType: 'INVOICE', refId: inv3.id },
    ],
  });

  // -- Ledger Accounts --
  const accounts = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '100', name: 'Kasa', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '102', name: 'Bankalar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '120', name: 'Alicilar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '153', name: 'Ticari Mallar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '320', name: 'Saticilar', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '391', name: 'Hesaplanan KDV', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '600', name: 'Yurt Ici Satislar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '621', name: 'Satilan Ticari Mallar Maliyeti', accountType: 'EXPENSE' } }),
  ]);

  // -- Fiscal Period & Journal --
  const fiscalPeriod = await prisma.fiscalPeriod.create({
    data: { tenantId: tenant.id, name: '2026 Q1', startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'), status: 'OPEN' },
  });
  await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id, fiscalPeriodId: fiscalPeriod.id,
      type: 'AUTO_INVOICE', number: 'JE-000001',
      date: new Date('2026-03-22'), description: 'INV-000001 satis faturasi kaydi',
      isPosted: true, postedAt: new Date('2026-03-22'),
      lines: {
        create: [
          { tenantId: tenant.id, accountId: accounts[2].id, debit: 31556.4, credit: 0, description: 'Alici borc', sortOrder: 0 },
          { tenantId: tenant.id, accountId: accounts[6].id, debit: 0, credit: 26297, description: 'Satis geliri', sortOrder: 1 },
          { tenantId: tenant.id, accountId: accounts[5].id, debit: 0, credit: 5259.4, description: 'Hesaplanan KDV', sortOrder: 2 },
        ]
      },
    },
  });
  console.log('  + Cari hareketler, hesap plani, yevmiye');

  // -- Misc starter data --
  await prisma.stockCount.create({
    data: {
      tenantId: tenant.id, warehouseId: warehouse.id, number: 'SC-000001', date: new Date('2026-03-31'),
      isFinalized: false, notes: 'Mart sonu sayimi',
      items: {
        create: [
          { tenantId: tenant.id, productId: products[0].id, expectedQty: 12, countedQty: 11, difference: -1 },
          { tenantId: tenant.id, productId: products[1].id, expectedQty: 45, countedQty: 45, difference: 0 },
        ]
      },
    },
  });

  const purchaseReq1 = await prisma.purchaseRequest.create({
    data: {
      tenantId: tenant.id, number: 'PR-000001', date: new Date('2026-03-20'), status: 'ORDERED', notes: 'Mart ayi stok takviyesi', totalEstimated: 54000,
      items: { create: [{ tenantId: tenant.id, productId: products[0].id, quantity: 3, unitPrice: 18000 }] }
    },
  });
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[3].id, number: 'PO-000001',
      date: new Date('2026-03-22'), dueDate: new Date('2026-04-05'),
      status: 'RECEIVED', notes: 'Laptop stok takviyesi',
      totalNet: 54000, totalTax: 10800, totalGross: 64800,
      items: { create: [{ tenantId: tenant.id, productId: products[0].id, description: 'Laptop Pro 15"', quantity: 3, received: 3, unitPrice: 18000, taxRate: 20, taxAmount: 10800, lineTotal: 64800 }] },
    },
  });
  await prisma.purchaseRequest.update({ where: { id: purchaseReq1.id }, data: { purchaseOrderId: po1.id } });
  await prisma.numberSequence.createMany({
    data: [
      { tenantId: tenant.id, module: 'purchase_request', prefix: 'PR-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'purchase_order', prefix: 'PO-', lastNum: 1, padding: 6 },
    ],
    skipDuplicates: true,
  });

  // Roles
  const roleAdmin = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Yonetici', description: 'Tam yetkili yonetici', isSystem: true } });
  await prisma.role.create({ data: { tenantId: tenant.id, name: 'Muhasebeci', description: 'Muhasebe ve fatura islemleri', isSystem: true } });
  await prisma.role.create({ data: { tenantId: tenant.id, name: 'Satis Temsilcisi', description: 'Satis ve teklif islemleri', isSystem: true } });
  await prisma.tenantUser.update({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    data: { roleId: roleAdmin.id },
  });

  // Settings
  await prisma.tenantSetting.createMany({
    data: [
      { tenantId: tenant.id, key: 'default_currency', value: 'TRY' },
      { tenantId: tenant.id, key: 'invoice_prefix', value: 'INV' },
      { tenantId: tenant.id, key: 'date_format', value: 'DD.MM.YYYY' },
      { tenantId: tenant.id, key: 'timezone', value: 'Europe/Istanbul' },
      { tenantId: tenant.id, key: 'language', value: 'tr' },
    ],
  });

  // Notifications
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: user.id, title: 'Kritik Stok Uyarisi', message: 'A4 Fotokopi Kagidi stogu minimum seviyenin altina dustu (3 adet).', module: 'inventory', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user.id, title: 'Gecikmis Fatura', message: 'INV-000003 numarali fatura vadesi gecti.', module: 'invoicing', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user.id, title: 'Yeni Odeme Alindi', message: 'Teknoloji Cozumleri Ltd. tarafindan 31.556,40 TL odeme alindi.', module: 'accounting', status: 'READ', readAt: new Date('2026-03-25') },
    ],
  });

  // Feature override
  await prisma.tenantFeatureOverride.create({
    data: { tenantId: tenant.id, featureKey: 'MAX_PRODUCTS', value: '1000', isEnabled: true, reason: 'Demo hesabi icin genisletilmis limit', expiresAt: new Date('2026-12-31') },
  });

  console.log('  + Starter tenant tamamlandi');

  // =============================================
  // PROFESSIONAL TENANT - Pro Ticaret A.S.
  // =============================================
  await seedProfessionalTenant();
  await seedEnterpriseTenant();

  console.log('\nSeed tamamlandi!');
  console.log('  Giris bilgileri:');
  console.log('  Starter : admin@axondemo.com  / demo1234  (axon-demo)');
  console.log('  Pro     : pro@proticaret.com  / demo1234  (pro-ticaret)');
  console.log('  Ent     : ent@globaluretim.com / demo1234 (global-uretim)');
  console.log('  Admin   : admin@axonerp.com   / admin1234');
}

async function seedProfessionalTenant() {
  console.log('\n  -- Professional Tenant --');

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'pro-ticaret',
      companyName: 'Pro Ticaret A.S.',
      taxNumber: '9876543210',
      taxOffice: 'Besiktas',
      email: 'info@proticaret.com',
      phone: '+90 212 555 0200',
      address: 'Levent Mah. No:10',
      city: 'Istanbul',
      country: 'TR',
      sector: 'Ticaret',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      modules: ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting', 'crm', 'purchasing', 'warehouse'],
    },
  });

  const hashedPassword = await bcrypt.hash('demo1234', 12);
  const owner = await prisma.user.create({ data: { email: 'pro@proticaret.com', name: 'Elif Demir', phone: '+90 533 555 0201', password: hashedPassword, isActive: true } });
  const user2 = await prisma.user.create({ data: { email: 'muhasebe@proticaret.com', name: 'Mehmet Kaya', phone: '+90 533 555 0202', password: hashedPassword, isActive: true } });
  const user3 = await prisma.user.create({ data: { email: 'satis@proticaret.com', name: 'Ayse Celik', phone: '+90 533 555 0203', password: hashedPassword, isActive: true } });

  // Roles
  const roleAdmin = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Yonetici', description: 'Tam yetkili yonetici', isSystem: true } });
  const roleAccountant = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Muhasebeci', description: 'Muhasebe ve fatura islemleri', isSystem: true } });
  const roleSales = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Satis Temsilcisi', description: 'Satis ve teklif islemleri', isSystem: true } });

  const allModules = ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting', 'crm', 'purchasing', 'warehouse'];
  const allActions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'] as const;
  for (const mod of allModules) { for (const action of allActions) { await prisma.rolePermission.create({ data: { roleId: roleAdmin.id, module: mod, action } }); } }
  for (const mod of ['accounting', 'invoicing']) { for (const action of ['CREATE', 'READ', 'UPDATE'] as const) { await prisma.rolePermission.create({ data: { roleId: roleAccountant.id, module: mod, action } }); } }
  await prisma.rolePermission.create({ data: { roleId: roleAccountant.id, module: 'reporting', action: 'READ' } });
  for (const mod of ['contacts', 'invoicing', 'crm']) { for (const action of ['CREATE', 'READ', 'UPDATE'] as const) { await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: mod, action } }); } }
  await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: 'reporting', action: 'READ' } });
  await prisma.rolePermission.create({ data: { roleId: roleSales.id, module: 'inventory', action: 'READ' } });

  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: owner.id, isOwner: true, isActive: true, roleId: roleAdmin.id } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user2.id, isOwner: false, isActive: true, roleId: roleAccountant.id } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user3.id, isOwner: false, isActive: true, roleId: roleSales.id } });
  console.log('  + Kullanicilar ve roller');

  // Master data
  const [unitAdet, unitKg, unitLt] = await Promise.all([
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Adet', code: 'AD' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Kilogram', code: 'KG' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Litre', code: 'LT' } }),
  ]);
  const catGida = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Gida' } });
  const catIcecek = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Icecek' } });
  const catTemizlik = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Temizlik' } });
  const [kdv1, kdv10, kdv20] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %1', rate: 1 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %10', rate: 10 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %20', rate: 20 } }),
  ]);
  await Promise.all([
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'TRY', name: 'Turk Lirasi', symbol: 'TL', defaultRate: 1, isBase: true } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'USD', name: 'Amerikan Dolari', symbol: '$', defaultRate: 32.5 } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'EUR', name: 'Euro', symbol: 'E', defaultRate: 35.2 } }),
  ]);
  console.log('  + Master data');

  // Warehouses
  const wh1 = await prisma.warehouse.create({ data: { tenantId: tenant.id, name: 'Merkez Depo', code: 'WH01', address: 'Maslak, Istanbul' } });
  const wh2 = await prisma.warehouse.create({ data: { tenantId: tenant.id, name: 'Anadolu Depo', code: 'WH02', address: 'Gebze, Kocaeli' } });
  const [loc1A, loc1B, loc2A] = await Promise.all([
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: wh1.id, name: 'Raf A-1', code: 'A-1' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: wh1.id, name: 'Raf B-1', code: 'B-1' } }),
    prisma.location.create({ data: { tenantId: tenant.id, warehouseId: wh2.id, name: 'Raf A-1', code: 'A-1' } }),
  ]);
  console.log('  + Coklu depo ve lokasyonlar');

  // Products
  const products = await Promise.all([
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P001', name: 'Zeytinyagi 1L', unitId: unitLt.id, categoryId: catGida.id, taxRateId: kdv1.id, purchasePrice: 120, salesPrice: 180, minStockLevel: 20, averageCost: 120 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P002', name: 'Dogal Maden Suyu (6li)', unitId: unitAdet.id, categoryId: catIcecek.id, taxRateId: kdv10.id, purchasePrice: 30, salesPrice: 48, minStockLevel: 50, averageCost: 30 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P003', name: 'Organik Bal 500g', unitId: unitKg.id, categoryId: catGida.id, taxRateId: kdv1.id, purchasePrice: 200, salesPrice: 320, minStockLevel: 15, averageCost: 200 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P004', name: 'Bulasik Deterjani 1L', unitId: unitLt.id, categoryId: catTemizlik.id, taxRateId: kdv20.id, purchasePrice: 45, salesPrice: 72, minStockLevel: 30, averageCost: 45 } }),
    prisma.product.create({ data: { tenantId: tenant.id, code: 'P005', name: 'Cay 1kg', unitId: unitKg.id, categoryId: catGida.id, taxRateId: kdv1.id, purchasePrice: 80, salesPrice: 130, minStockLevel: 25, averageCost: 80 } }),
  ]);

  const stockData = [
    { productId: products[0].id, qty: 100, warehouseId: wh1.id, locationId: loc1A.id },
    { productId: products[1].id, qty: 200, warehouseId: wh1.id, locationId: loc1A.id },
    { productId: products[2].id, qty: 40, warehouseId: wh1.id, locationId: loc1B.id },
    { productId: products[3].id, qty: 80, warehouseId: wh1.id, locationId: loc1B.id },
    { productId: products[4].id, qty: 60, warehouseId: wh1.id, locationId: loc1A.id },
    { productId: products[0].id, qty: 50, warehouseId: wh2.id, locationId: loc2A.id },
    { productId: products[1].id, qty: 150, warehouseId: wh2.id, locationId: loc2A.id },
    { productId: products[3].id, qty: 40, warehouseId: wh2.id, locationId: loc2A.id },
  ];
  for (const s of stockData) {
    await prisma.stockLevel.create({ data: { tenantId: tenant.id, productId: s.productId, warehouseId: s.warehouseId, locationId: s.locationId, quantity: s.qty } });
    await prisma.stockMovement.create({ data: { tenantId: tenant.id, productId: s.productId, type: 'OPENING', quantity: s.qty, toWarehouseId: s.warehouseId, notes: 'Acilis stogu' } });
  }
  console.log('  + Urunler ve stok seviyeleri');

  // Product Batches & Lot/Serial Numbers
  const batch1 = await prisma.productBatch.create({ data: { tenantId: tenant.id, productId: products[0].id, batchNumber: 'ZYT-2026-001', expiryDate: new Date('2027-06-15'), manufacturedAt: new Date('2026-01-10'), quantity: 100, notes: 'Ege bolgesinden ilk parti' } });
  const batch2 = await prisma.productBatch.create({ data: { tenantId: tenant.id, productId: products[0].id, batchNumber: 'ZYT-2026-002', expiryDate: new Date('2027-09-20'), manufacturedAt: new Date('2026-03-05'), quantity: 50, notes: 'Ikinci parti - organik' } });
  const batch3 = await prisma.productBatch.create({ data: { tenantId: tenant.id, productId: products[2].id, batchNumber: 'BAL-2026-001', expiryDate: new Date('2028-01-01'), manufacturedAt: new Date('2025-12-15'), quantity: 40, notes: 'Mugla cicek bali' } });
  const batch4 = await prisma.productBatch.create({ data: { tenantId: tenant.id, productId: products[4].id, batchNumber: 'CAY-2026-001', expiryDate: new Date('2027-12-31'), manufacturedAt: new Date('2026-02-01'), quantity: 60, notes: 'Rize siyah cay' } });

  // Lot/Serial Numbers
  for (let i = 1; i <= 10; i++) {
    await prisma.lotSerialNumber.create({ data: { tenantId: tenant.id, productId: products[0].id, batchId: batch1.id, serialNumber: `ZYT-001-${String(i).padStart(4, '0')}`, isUsed: i <= 3 } });
  }
  for (let i = 1; i <= 5; i++) {
    await prisma.lotSerialNumber.create({ data: { tenantId: tenant.id, productId: products[0].id, batchId: batch2.id, serialNumber: `ZYT-002-${String(i).padStart(4, '0')}` } });
  }
  for (let i = 1; i <= 8; i++) {
    await prisma.lotSerialNumber.create({ data: { tenantId: tenant.id, productId: products[2].id, batchId: batch3.id, serialNumber: `BAL-001-${String(i).padStart(4, '0')}`, isUsed: i <= 2 } });
  }
  for (let i = 1; i <= 6; i++) {
    await prisma.lotSerialNumber.create({ data: { tenantId: tenant.id, productId: products[4].id, batchId: batch4.id, serialNumber: `CAY-001-${String(i).padStart(4, '0')}` } });
  }
  console.log('  + Urun partileri ve lot/seri numaralari');

  // Contacts
  const contacts = await Promise.all([
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Market Zinciri A.S.', code: 'C001', taxNumber: '1112223344', taxOffice: 'Kadikoy', email: 'satin@marketzinciri.com', phone: '+90 212 444 0010', city: 'Istanbul', country: 'TR', creditLimit: 200000, paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Organik Yasam Ltd.', code: 'C002', taxNumber: '5556667788', taxOffice: 'Cankaya', email: 'info@organikyasam.com', phone: '+90 312 444 0020', city: 'Ankara', country: 'TR', creditLimit: 100000, paymentTermDays: 15 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Ege Tarim Koop.', code: 'S001', taxNumber: '9998887766', taxOffice: 'Izmir', email: 'satis@egetarim.com', phone: '+90 232 555 0010', city: 'Izmir', country: 'TR', paymentTermDays: 45 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Temizlik Dunyasi', code: 'S002', taxNumber: '3334445566', taxOffice: 'Bagcilar', email: 'siparis@temizlikdunyasi.com', phone: '+90 212 555 0020', city: 'Istanbul', country: 'TR', paymentTermDays: 30 } }),
    prisma.contact.create({ data: { tenantId: tenant.id, type: 'BOTH', name: 'Anadolu Gida Dagitim', code: 'B001', taxNumber: '7778889900', taxOffice: 'Umraniye', email: 'info@anadolugida.com', phone: '+90 216 555 0030', city: 'Istanbul', country: 'TR', creditLimit: 150000, paymentTermDays: 30 } }),
  ]);
  console.log('  + Cari hesaplar');

  // Number sequences
  await prisma.numberSequence.createMany({
    data: [
      { tenantId: tenant.id, module: 'invoice', prefix: 'INV-', lastNum: 3, padding: 6 },
      { tenantId: tenant.id, module: 'sales_quote', prefix: 'TKL-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'sales_order', prefix: 'SIP-', lastNum: 2, padding: 6 },
      { tenantId: tenant.id, module: 'journal', prefix: 'JE-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'purchase_request', prefix: 'PR-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'purchase_order', prefix: 'PO-', lastNum: 1, padding: 6 },
    ],
  });

  // Sales
  const so1 = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id,
      number: 'SIP-000001', date: new Date('2026-03-15'), dueDate: new Date('2026-04-15'),
      status: 'CONFIRMED', totalNet: 18000, totalTax: 180, totalGross: 18180,
      items: { create: [{ tenantId: tenant.id, productId: products[0].id, description: 'Zeytinyagi 1L', quantity: 100, unitPrice: 180, discount: 0, taxRate: 1, taxAmount: 180, lineTotal: 18180, sortOrder: 0 }] },
    },
  });
  const so2 = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[1].id,
      number: 'SIP-000002', date: new Date('2026-03-25'), dueDate: new Date('2026-04-10'),
      status: 'DRAFT', totalNet: 9600, totalTax: 960, totalGross: 10560,
      items: { create: [{ tenantId: tenant.id, productId: products[1].id, description: 'Dogal Maden Suyu (6li)', quantity: 200, unitPrice: 48, discount: 0, taxRate: 10, taxAmount: 960, lineTotal: 10560, sortOrder: 0 }] },
    },
  });
  console.log('  + Siparisler');

  // Invoices
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[0].id, salesOrderId: so1.id,
      type: 'SALES', status: 'PAID', number: 'INV-000001',
      date: new Date('2026-03-18'), dueDate: new Date('2026-04-18'),
      totalNet: 18000, totalTax: 180, totalGross: 18180,
      lines: { create: [{ tenantId: tenant.id, productId: products[0].id, taxRateId: kdv1.id, description: 'Zeytinyagi 1L', quantity: 100, unitPrice: 180, discount: 0, taxAmount: 180, lineTotal: 18180, sortOrder: 0 }] },
    },
  });
  const inv2 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[1].id,
      type: 'SALES', status: 'SENT', number: 'INV-000002',
      date: new Date('2026-03-28'), dueDate: new Date('2026-04-12'),
      totalNet: 12800, totalTax: 128, totalGross: 12928,
      lines: { create: [{ tenantId: tenant.id, productId: products[2].id, taxRateId: kdv1.id, description: 'Organik Bal 500g', quantity: 40, unitPrice: 320, discount: 0, taxAmount: 128, lineTotal: 12928, sortOrder: 0 }] },
    },
  });
  const inv3 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: contacts[2].id,
      type: 'PURCHASE', status: 'PAID', number: 'INV-000003',
      date: new Date('2026-03-05'), dueDate: new Date('2026-04-20'),
      totalNet: 24000, totalTax: 240, totalGross: 24240,
      lines: { create: [{ tenantId: tenant.id, productId: products[0].id, taxRateId: kdv1.id, description: 'Zeytinyagi 1L (200 adet)', quantity: 200, unitPrice: 120, discount: 0, taxAmount: 240, lineTotal: 24240, sortOrder: 0 }] },
    },
  });
  console.log('  + Faturalar');

  // Bank & Payments
  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId: tenant.id, name: 'Is Bankasi Vadesiz TRY', bankName: 'Is Bankasi', accountNumber: '7654321', iban: 'TR98 0006 4000 7654 3210 9876 54', currencyCode: 'TRY' },
  });
  await prisma.cashAccount.create({ data: { tenantId: tenant.id, name: 'Ana Kasa', currencyCode: 'TRY' } });
  const pay1 = await prisma.payment.create({
    data: { tenantId: tenant.id, contactId: contacts[0].id, bankAccountId: bankAccount.id, date: new Date('2026-03-20'), amount: 18180, method: 'BANK_TRANSFER', reference: 'EFT-2026-001', status: 'COMPLETED' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: pay1.id, invoiceId: inv1.id, amount: 18180 } });
  const pay2 = await prisma.payment.create({
    data: { tenantId: tenant.id, contactId: contacts[2].id, bankAccountId: bankAccount.id, date: new Date('2026-03-08'), amount: 24240, method: 'BANK_TRANSFER', reference: 'EFT-2026-002', status: 'COMPLETED' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: pay2.id, invoiceId: inv3.id, amount: 24240 } });
  console.log('  + Banka ve odemeler');

  // Accounting
  const accs = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '100', name: 'Kasa', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '102', name: 'Bankalar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '120', name: 'Alicilar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '153', name: 'Ticari Mallar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '320', name: 'Saticilar', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '391', name: 'Hesaplanan KDV', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '600', name: 'Yurt Ici Satislar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '621', name: 'Satilan Ticari Mallar Maliyeti', accountType: 'EXPENSE' } }),
  ]);
  const fp = await prisma.fiscalPeriod.create({ data: { tenantId: tenant.id, name: '2026 Q1', startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'), status: 'OPEN' } });
  await prisma.journalEntry.create({
    data: {
      tenantId: tenant.id, fiscalPeriodId: fp.id, type: 'AUTO_INVOICE', number: 'JE-000001',
      date: new Date('2026-03-18'), description: 'INV-000001 satis faturasi kaydi', isPosted: true, postedAt: new Date('2026-03-18'),
      lines: {
        create: [
          { tenantId: tenant.id, accountId: accs[2].id, debit: 18180, credit: 0, description: 'Alici borc', sortOrder: 0 },
          { tenantId: tenant.id, accountId: accs[6].id, debit: 0, credit: 18000, description: 'Satis geliri', sortOrder: 1 },
          { tenantId: tenant.id, accountId: accs[5].id, debit: 0, credit: 180, description: 'Hesaplanan KDV', sortOrder: 2 },
        ]
      },
    },
  });
  console.log('  + Muhasebe kayitlari');

  // Purchase
  const pr1 = await prisma.purchaseRequest.create({
    data: {
      tenantId: tenant.id, number: 'PR-000001', date: new Date('2026-03-01'), status: 'ORDERED', totalEstimated: 24000,
      items: { create: [{ tenantId: tenant.id, productId: products[0].id, quantity: 200, unitPrice: 120 }] }
    },
  });
  const po1 = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id, contactId: contacts[2].id, number: 'PO-000001',
      date: new Date('2026-03-03'), dueDate: new Date('2026-03-15'), status: 'RECEIVED',
      totalNet: 24000, totalTax: 240, totalGross: 24240,
      items: { create: [{ tenantId: tenant.id, productId: products[0].id, description: 'Zeytinyagi 1L', quantity: 200, received: 200, unitPrice: 120, taxRate: 1, taxAmount: 240, lineTotal: 24240 }] },
    },
  });
  await prisma.purchaseRequest.update({ where: { id: pr1.id }, data: { purchaseOrderId: po1.id } });
  console.log('  + Satin alma');

  // -- Approval Flows --
  const flowPurchase = await prisma.approvalFlow.create({ data: { tenantId: tenant.id, name: 'Satin Alma Onayi', module: 'PURCHASE_REQUEST', isActive: true } });
  const stepPurch1 = await prisma.approvalStep.create({ data: { flowId: flowPurchase.id, stepOrder: 1, name: 'Departman Muduru Onayi', approverRoleId: roleAccountant.id, isRequired: true } });
  const stepPurch2 = await prisma.approvalStep.create({ data: { flowId: flowPurchase.id, stepOrder: 2, name: 'Genel Mudur Onayi', approverRoleId: roleAdmin.id, isRequired: true } });

  const flowInvoice = await prisma.approvalFlow.create({ data: { tenantId: tenant.id, name: 'Fatura Onayi', module: 'INVOICE', isActive: true } });
  await prisma.approvalStep.create({ data: { flowId: flowInvoice.id, stepOrder: 1, name: 'Muhasebe Onayi', approverRoleId: roleAccountant.id, isRequired: true } });

  const flowSales = await prisma.approvalFlow.create({ data: { tenantId: tenant.id, name: 'Satis Siparisi Onayi', module: 'SALES_ORDER', isActive: true } });
  await prisma.approvalStep.create({ data: { flowId: flowSales.id, stepOrder: 1, name: 'Satis Muduru Onayi', approverRoleId: roleSales.id, isRequired: true } });
  await prisma.approvalStep.create({ data: { flowId: flowSales.id, stepOrder: 2, name: 'Finans Onayi', approverRoleId: roleAccountant.id, isRequired: true } });

  const flowOld = await prisma.approvalFlow.create({ data: { tenantId: tenant.id, name: 'Eski Izin Onayi', module: 'LEAVE_REQUEST', isActive: false } });
  await prisma.approvalStep.create({ data: { flowId: flowOld.id, stepOrder: 1, name: 'IK Onayi', isRequired: true } });

  // -- Approval Requests --
  const req1 = await prisma.approvalRequest.create({
    data: { tenantId: tenant.id, flowId: flowPurchase.id, entityType: 'PURCHASE_ORDER', entityId: po1.id, status: 'APPROVED', currentStep: 2, requestedBy: user3.id, notes: 'Zeytinyagi stok takviyesi icin acil onay', resolvedAt: new Date('2026-03-04') },
  });
  await prisma.approvalAction.createMany({
    data: [
      { requestId: req1.id, stepId: stepPurch1.id, actionType: 'APPROVE', actorId: user2.id, notes: 'Butce uygun, onaylandi.', createdAt: new Date('2026-03-03T10:00:00Z') },
      { requestId: req1.id, stepId: stepPurch2.id, actionType: 'APPROVE', actorId: owner.id, notes: 'Genel mudur onayi verildi.', createdAt: new Date('2026-03-04T09:00:00Z') },
    ]
  });

  await prisma.approvalRequest.create({
    data: { tenantId: tenant.id, flowId: flowInvoice.id, entityType: 'INVOICE', entityId: inv2.id, status: 'PENDING', currentStep: 1, requestedBy: user3.id, notes: 'Organik Yasam faturasi onay bekliyor' },
  });

  const req3 = await prisma.approvalRequest.create({
    data: { tenantId: tenant.id, flowId: flowSales.id, entityType: 'SALES_ORDER', entityId: so2.id, status: 'PENDING', currentStep: 2, requestedBy: user3.id, notes: 'Maden suyu siparisi - buyuk miktar, finans onayi gerekli' },
  });
  await prisma.approvalAction.create({ data: { requestId: req3.id, actionType: 'APPROVE', actorId: user3.id, notes: 'Satis muduru onayladi.', createdAt: new Date('2026-03-26T14:00:00Z') } });

  const req4 = await prisma.approvalRequest.create({
    data: { tenantId: tenant.id, flowId: flowPurchase.id, entityType: 'PURCHASE_ORDER', entityId: products[3].id, status: 'REJECTED', currentStep: 1, requestedBy: user3.id, notes: 'Deterjan alimi talebi', resolvedAt: new Date('2026-03-28') },
  });
  await prisma.approvalAction.create({ data: { requestId: req4.id, stepId: stepPurch1.id, actionType: 'REJECT', actorId: user2.id, notes: 'Butce asimi, bu ay alim yapilamaz.', createdAt: new Date('2026-03-28T11:00:00Z') } });

  await prisma.approvalRequest.create({
    data: { tenantId: tenant.id, flowId: flowInvoice.id, entityType: 'INVOICE', entityId: inv1.id, status: 'PENDING', currentStep: 1, requestedBy: owner.id, notes: 'Market Zinciri faturasi kontrol onayi' },
  });
  console.log('  + Onay akislari ve talepler');

  // Settings & notifications
  await prisma.tenantSetting.createMany({
    data: [
      { tenantId: tenant.id, key: 'default_currency', value: 'TRY' },
      { tenantId: tenant.id, key: 'invoice_prefix', value: 'INV' },
      { tenantId: tenant.id, key: 'date_format', value: 'DD.MM.YYYY' },
      { tenantId: tenant.id, key: 'timezone', value: 'Europe/Istanbul' },
      { tenantId: tenant.id, key: 'language', value: 'tr' },
    ],
  });
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: owner.id, title: 'Yeni Odeme Alindi', message: 'Market Zinciri A.S. tarafindan 18.180 TL odeme alindi.', module: 'accounting', status: 'READ', readAt: new Date('2026-03-20') },
      { tenantId: tenant.id, userId: owner.id, title: 'Bekleyen Fatura', message: 'INV-000002 numarali fatura henuz odenmedi.', module: 'invoicing', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user2.id, title: 'Mutabakat Bekliyor', message: 'Mart 2026 banka mutabakatinda eslesmeyen kalem var.', module: 'accounting', status: 'UNREAD' },
    ],
  });

  // API Key
  const apiKeyHash = await bcrypt.hash('sk_live_pro_ticaret_demo_key_001', 10);
  await prisma.apiKey.create({
    data: { tenantId: tenant.id, name: 'Production API', keyHash: apiKeyHash, keyPrefix: 'sk_live_', isActive: true, scopes: ['invoices:read', 'products:read', 'contacts:read'] },
  });

  console.log('  + Professional Tenant: Pro Ticaret A.S. (pro@proticaret.com / demo1234)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

async function seedEnterpriseTenant() {
  console.log('\n  -- Enterprise Tenant --');

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'global-uretim',
      companyName: 'Global Uretim Sanayi A.S.',
      taxNumber: '5551234567',
      taxOffice: 'Gebze',
      email: 'info@globaluretim.com',
      phone: '+90 262 555 0300',
      address: 'Organize Sanayi Bolgesi No:15',
      city: 'Kocaeli',
      country: 'TR',
      sector: 'Uretim',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      modules: [
        'accounting', 'inventory', 'contacts', 'invoicing', 'reporting',
        'crm', 'purchasing', 'warehouse', 'production', 'service',
        'marketplace', 'hr', 'payroll',
      ],
    },
  });

  const hashedPassword = await bcrypt.hash('demo1234', 12);
  const owner = await prisma.user.create({ data: { email: 'ent@globaluretim.com', name: 'Can Ozturk', phone: '+90 534 555 0301', password: hashedPassword, isActive: true } });
  const user2 = await prisma.user.create({ data: { email: 'uretim@globaluretim.com', name: 'Fatma Yildiz', phone: '+90 534 555 0302', password: hashedPassword, isActive: true } });
  const user3 = await prisma.user.create({ data: { email: 'ik@globaluretim.com', name: 'Ali Koc', phone: '+90 534 555 0303', password: hashedPassword, isActive: true } });

  // Roles
  const roleAdmin = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Yonetici', description: 'Tam yetkili', isSystem: true } });
  const roleProd = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Uretim Muduru', description: 'Uretim islemleri', isSystem: true } });
  const roleHR = await prisma.role.create({ data: { tenantId: tenant.id, name: 'IK Muduru', description: 'Insan kaynaklari', isSystem: true } });

  const allModules = ['accounting', 'inventory', 'contacts', 'invoicing', 'reporting', 'crm', 'purchasing', 'warehouse', 'production', 'service', 'marketplace', 'hr', 'payroll'];
  for (const mod of allModules) { for (const action of ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'] as const) { await prisma.rolePermission.create({ data: { roleId: roleAdmin.id, module: mod, action } }); } }
  for (const mod of ['production', 'inventory', 'warehouse']) { for (const action of ['CREATE', 'READ', 'UPDATE'] as const) { await prisma.rolePermission.create({ data: { roleId: roleProd.id, module: mod, action } }); } }
  for (const mod of ['hr', 'payroll']) { for (const action of ['CREATE', 'READ', 'UPDATE'] as const) { await prisma.rolePermission.create({ data: { roleId: roleHR.id, module: mod, action } }); } }

  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: owner.id, isOwner: true, isActive: true, roleId: roleAdmin.id } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user2.id, isOwner: false, isActive: true, roleId: roleProd.id } });
  await prisma.tenantUser.create({ data: { tenantId: tenant.id, userId: user3.id, isOwner: false, isActive: true, roleId: roleHR.id } });
  console.log('  + Kullanicilar ve roller');

  // Master data
  const [unitAdet, unitKg] = await Promise.all([
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Adet', code: 'AD' } }),
    prisma.unit.create({ data: { tenantId: tenant.id, name: 'Kilogram', code: 'KG' } }),
  ]);
  const catHammadde = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Hammadde' } });
  const catMamul = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Mamul' } });
  const [kdv1, kdv20] = await Promise.all([
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %1', rate: 1 } }),
    prisma.taxRate.create({ data: { tenantId: tenant.id, name: 'KDV %20', rate: 20 } }),
  ]);
  await Promise.all([
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'TRY', name: 'Turk Lirasi', symbol: 'TL', defaultRate: 1, isBase: true } }),
    prisma.currency.create({ data: { tenantId: tenant.id, code: 'USD', name: 'Amerikan Dolari', symbol: '$', defaultRate: 32.5 } }),
  ]);
  console.log('  + Master data');

  // Warehouses
  const whHammadde = await prisma.warehouse.create({ data: { tenantId: tenant.id, name: 'Hammadde Deposu', code: 'WH-HAM', address: 'OSB A Blok' } });
  const whMamul = await prisma.warehouse.create({ data: { tenantId: tenant.id, name: 'Mamul Deposu', code: 'WH-MAM', address: 'OSB B Blok' } });
  const locHam = await prisma.location.create({ data: { tenantId: tenant.id, warehouseId: whHammadde.id, name: 'Ana Raf', code: 'A-1' } });
  const locMam = await prisma.location.create({ data: { tenantId: tenant.id, warehouseId: whMamul.id, name: 'Ana Raf', code: 'A-1' } });
  console.log('  + Depolar');

  // Products (hammadde + mamul)
  const pAluminyum = await prisma.product.create({ data: { tenantId: tenant.id, code: 'HAM-001', name: 'Aluminyum Profil 6m', unitId: unitAdet.id, categoryId: catHammadde.id, taxRateId: kdv20.id, purchasePrice: 450, salesPrice: 0, minStockLevel: 50, averageCost: 450 } });
  const pVida = await prisma.product.create({ data: { tenantId: tenant.id, code: 'HAM-002', name: 'Paslanmaz Vida M6 (100lu)', unitId: unitAdet.id, categoryId: catHammadde.id, taxRateId: kdv20.id, purchasePrice: 85, salesPrice: 0, minStockLevel: 100, averageCost: 85 } });
  const pBoya = await prisma.product.create({ data: { tenantId: tenant.id, code: 'HAM-003', name: 'Endustriyel Boya 5L', unitId: unitAdet.id, categoryId: catHammadde.id, taxRateId: kdv20.id, purchasePrice: 320, salesPrice: 0, minStockLevel: 20, averageCost: 320 } });
  const pCerceve = await prisma.product.create({ data: { tenantId: tenant.id, code: 'MAM-001', name: 'Aluminyum Pencere Cercevesi', unitId: unitAdet.id, categoryId: catMamul.id, taxRateId: kdv20.id, purchasePrice: 0, salesPrice: 2500, minStockLevel: 10, averageCost: 1200 } });
  const pKapi = await prisma.product.create({ data: { tenantId: tenant.id, code: 'MAM-002', name: 'Aluminyum Kapi Sistemi', unitId: unitAdet.id, categoryId: catMamul.id, taxRateId: kdv20.id, purchasePrice: 0, salesPrice: 4500, minStockLevel: 5, averageCost: 2100 } });

  // Stock levels
  for (const s of [
    { productId: pAluminyum.id, qty: 200, warehouseId: whHammadde.id, locationId: locHam.id },
    { productId: pVida.id, qty: 500, warehouseId: whHammadde.id, locationId: locHam.id },
    { productId: pBoya.id, qty: 40, warehouseId: whHammadde.id, locationId: locHam.id },
    { productId: pCerceve.id, qty: 25, warehouseId: whMamul.id, locationId: locMam.id },
    { productId: pKapi.id, qty: 8, warehouseId: whMamul.id, locationId: locMam.id },
  ]) {
    await prisma.stockLevel.create({ data: { tenantId: tenant.id, productId: s.productId, warehouseId: s.warehouseId, locationId: s.locationId, quantity: s.qty } });
    await prisma.stockMovement.create({ data: { tenantId: tenant.id, productId: s.productId, type: 'OPENING', quantity: s.qty, toWarehouseId: s.warehouseId, notes: 'Acilis stogu' } });
  }
  console.log('  + Urunler ve stok');

  // Contacts
  const cMusteri = await prisma.contact.create({ data: { tenantId: tenant.id, type: 'CUSTOMER', name: 'Insaat Holding A.S.', code: 'C001', taxNumber: '1231231234', taxOffice: 'Gebze', email: 'satin@insaatholding.com', city: 'Istanbul', creditLimit: 500000, paymentTermDays: 60 } });
  const cTedarikci = await prisma.contact.create({ data: { tenantId: tenant.id, type: 'SUPPLIER', name: 'Metal Sanayi Ltd.', code: 'S001', taxNumber: '4564564567', taxOffice: 'Dilovasi', email: 'satis@metalsanayi.com', city: 'Kocaeli', paymentTermDays: 45 } });
  console.log('  + Cari hesaplar');

  // ─── PRODUCTION ─────────────────────────────

  const wc1 = await prisma.workCenter.create({ data: { tenantId: tenant.id, code: 'WC01', name: 'Kesim Hatti', description: 'Aluminyum profil kesim', capacity: 500 } });
  const wc2 = await prisma.workCenter.create({ data: { tenantId: tenant.id, code: 'WC02', name: 'Montaj Hatti', description: 'Cerceve ve kapi montaji', capacity: 200 } });
  const wc3 = await prisma.workCenter.create({ data: { tenantId: tenant.id, code: 'WC03', name: 'Boyahane', description: 'Elektrostatik toz boya', capacity: 300 } });

  // BOM — Pencere Cercevesi
  const bomCerceve = await prisma.bOM.create({
    data: {
      tenantId: tenant.id, productId: pCerceve.id, name: 'Pencere Cercevesi Recetesi', version: '1.0',
      items: { create: [
        { tenantId: tenant.id, productId: pAluminyum.id, quantity: 2, unit: 'AD', sortOrder: 0 },
        { tenantId: tenant.id, productId: pVida.id, quantity: 1, unit: 'AD', notes: '1 paket (100 adet)', sortOrder: 1 },
        { tenantId: tenant.id, productId: pBoya.id, quantity: 0.5, unit: 'AD', notes: 'Yarim bidon', sortOrder: 2 },
      ] },
      routings: { create: [
        { tenantId: tenant.id, workCenterId: wc1.id, name: 'Profil Kesim', stepOrder: 1, setupTime: 15, runTime: 5 },
        { tenantId: tenant.id, workCenterId: wc2.id, name: 'Cerceve Montaj', stepOrder: 2, setupTime: 10, runTime: 12 },
        { tenantId: tenant.id, workCenterId: wc3.id, name: 'Boya', stepOrder: 3, setupTime: 20, runTime: 3 },
      ] },
    },
  });

  // BOM — Kapi Sistemi
  const bomKapi = await prisma.bOM.create({
    data: {
      tenantId: tenant.id, productId: pKapi.id, name: 'Kapi Sistemi Recetesi', version: '1.0',
      items: { create: [
        { tenantId: tenant.id, productId: pAluminyum.id, quantity: 4, unit: 'AD', sortOrder: 0 },
        { tenantId: tenant.id, productId: pVida.id, quantity: 2, unit: 'AD', sortOrder: 1 },
        { tenantId: tenant.id, productId: pBoya.id, quantity: 1, unit: 'AD', sortOrder: 2 },
      ] },
      routings: { create: [
        { tenantId: tenant.id, workCenterId: wc1.id, name: 'Profil Kesim', stepOrder: 1, setupTime: 20, runTime: 8 },
        { tenantId: tenant.id, workCenterId: wc2.id, name: 'Kapi Montaj', stepOrder: 2, setupTime: 15, runTime: 20 },
        { tenantId: tenant.id, workCenterId: wc3.id, name: 'Boya', stepOrder: 3, setupTime: 20, runTime: 5 },
      ] },
    },
  });

  // Number sequences
  await prisma.numberSequence.createMany({
    data: [
      { tenantId: tenant.id, module: 'work_order', prefix: 'WO-', lastNum: 2, padding: 6 },
      { tenantId: tenant.id, module: 'service_request', prefix: 'SR-', lastNum: 2, padding: 6 },
      { tenantId: tenant.id, module: 'invoice', prefix: 'INV-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'sales_order', prefix: 'SIP-', lastNum: 1, padding: 6 },
      { tenantId: tenant.id, module: 'purchase_order', prefix: 'PO-', lastNum: 1, padding: 6 },
    ],
  });

  // Work Orders
  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id, productId: pCerceve.id, bomId: bomCerceve.id,
      number: 'WO-000001', status: 'COMPLETED', plannedQty: 50, producedQty: 50,
      startDate: new Date('2026-03-01'), endDate: new Date('2026-03-10'),
      inputWarehouseId: whHammadde.id, outputWarehouseId: whMamul.id,
      notes: 'Mart ayi pencere cercevesi uretimi',
      items: { create: [
        { tenantId: tenant.id, productId: pAluminyum.id, requiredQty: 100, consumedQty: 100 },
        { tenantId: tenant.id, productId: pVida.id, requiredQty: 50, consumedQty: 48 },
        { tenantId: tenant.id, productId: pBoya.id, requiredQty: 25, consumedQty: 25 },
      ] },
      history: { create: [
        { tenantId: tenant.id, toStatus: 'PLANNED', createdAt: new Date('2026-02-28') },
        { tenantId: tenant.id, fromStatus: 'PLANNED', toStatus: 'IN_PROGRESS', createdAt: new Date('2026-03-01') },
        { tenantId: tenant.id, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', createdAt: new Date('2026-03-10') },
      ] },
    },
  });

  await prisma.workOrder.create({
    data: {
      tenantId: tenant.id, productId: pKapi.id, bomId: bomKapi.id,
      number: 'WO-000002', status: 'IN_PROGRESS', plannedQty: 20, producedQty: 8,
      startDate: new Date('2026-03-20'), endDate: new Date('2026-04-05'),
      inputWarehouseId: whHammadde.id, outputWarehouseId: whMamul.id,
      notes: 'Insaat Holding siparisi icin kapi uretimi',
      items: { create: [
        { tenantId: tenant.id, productId: pAluminyum.id, requiredQty: 80, consumedQty: 32 },
        { tenantId: tenant.id, productId: pVida.id, requiredQty: 40, consumedQty: 16 },
        { tenantId: tenant.id, productId: pBoya.id, requiredQty: 20, consumedQty: 8 },
      ] },
      history: { create: [
        { tenantId: tenant.id, toStatus: 'PLANNED', createdAt: new Date('2026-03-18') },
        { tenantId: tenant.id, fromStatus: 'PLANNED', toStatus: 'IN_PROGRESS', createdAt: new Date('2026-03-20') },
      ] },
    },
  });
  console.log('  + Uretim (is merkezleri, BOM, is emirleri)');

  // ─── SERVICE ────────────────────────────────

  const asset1 = await prisma.customerAsset.create({
    data: { tenantId: tenant.id, contactId: cMusteri.id, name: 'CNC Kesim Makinesi', brand: 'Haas', model: 'VF-2SS', serialNo: 'HAAS-2024-001', purchaseDate: new Date('2024-06-15'), warrantyEnd: new Date('2027-06-15'), notes: 'Ana uretim hatti CNC' },
  });
  const asset2 = await prisma.customerAsset.create({
    data: { tenantId: tenant.id, contactId: cMusteri.id, name: 'Elektrostatik Boya Kabini', brand: 'Wagner', model: 'PrimaSprint', serialNo: 'WAG-2025-042', purchaseDate: new Date('2025-01-10'), warrantyEnd: new Date('2028-01-10') },
  });

  const sr1 = await prisma.serviceRequest.create({
    data: {
      tenantId: tenant.id, contactId: cMusteri.id, customerAssetId: asset1.id,
      number: 'SR-000001', status: 'COMPLETED', subject: 'CNC kalibrasyon bakimi',
      description: 'Yillik periyodik bakim ve kalibrasyon', priority: 'MEDIUM',
      assignedToId: user2.id, closedAt: new Date('2026-03-15'),
      warrantyEnd: new Date('2027-06-15'),
      items: { create: [
        { tenantId: tenant.id, description: 'Kalibrasyon hizmeti', quantity: 1, unitPrice: 5000, lineTotal: 5000 },
        { tenantId: tenant.id, description: 'Yedek parca - rulman seti', quantity: 2, unitPrice: 750, lineTotal: 1500 },
      ] },
      activities: { create: [
        { tenantId: tenant.id, activityType: 'NOTE', notes: 'Talep alindi, teknisyen atandi.', createdAt: new Date('2026-03-10') },
        { tenantId: tenant.id, activityType: 'STATUS_CHANGE', notes: 'OPEN → IN_PROGRESS', createdAt: new Date('2026-03-12') },
        { tenantId: tenant.id, activityType: 'VISIT', notes: 'Saha ziyareti yapildi, kalibrasyon tamamlandi.', createdAt: new Date('2026-03-14') },
        { tenantId: tenant.id, activityType: 'STATUS_CHANGE', notes: 'IN_PROGRESS → COMPLETED', createdAt: new Date('2026-03-15') },
      ] },
      history: { create: [
        { tenantId: tenant.id, toStatus: 'OPEN', createdAt: new Date('2026-03-10') },
        { tenantId: tenant.id, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', createdAt: new Date('2026-03-12') },
        { tenantId: tenant.id, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', createdAt: new Date('2026-03-15') },
      ] },
    },
  });

  await prisma.serviceRequest.create({
    data: {
      tenantId: tenant.id, contactId: cMusteri.id, customerAssetId: asset2.id,
      number: 'SR-000002', status: 'IN_PROGRESS', subject: 'Boya kabini filtre degisimi',
      description: 'Filtreler tikanmis, performans dustu', priority: 'HIGH',
      assignedToId: user2.id, warrantyEnd: new Date('2028-01-10'),
      activities: { create: [
        { tenantId: tenant.id, activityType: 'NOTE', notes: 'Acil talep, filtre stogu kontrol ediliyor.', createdAt: new Date('2026-03-28') },
        { tenantId: tenant.id, activityType: 'STATUS_CHANGE', notes: 'OPEN → IN_PROGRESS', createdAt: new Date('2026-03-29') },
      ] },
      history: { create: [
        { tenantId: tenant.id, toStatus: 'OPEN', createdAt: new Date('2026-03-28') },
        { tenantId: tenant.id, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', createdAt: new Date('2026-03-29') },
      ] },
    },
  });
  console.log('  + Teknik servis (varliklar, talepler, aktiviteler)');

  // ─── MARKETPLACE ────────────────────────────

  const mpTrendyol = await prisma.marketplaceIntegration.create({
    data: { tenantId: tenant.id, channel: 'TRENDYOL', name: 'Trendyol Magaza', isActive: true, lastSyncAt: new Date('2026-03-30') },
  });
  const mpHB = await prisma.marketplaceIntegration.create({
    data: { tenantId: tenant.id, channel: 'HEPSIBURADA', name: 'Hepsiburada Magaza', isActive: true, lastSyncAt: new Date('2026-03-29') },
  });

  await prisma.marketplaceListing.createMany({
    data: [
      { tenantId: tenant.id, integrationId: mpTrendyol.id, productId: pCerceve.id, externalId: 'TY-CERC-001', price: 2800, stock: 25, isActive: true, lastSyncAt: new Date('2026-03-30') },
      { tenantId: tenant.id, integrationId: mpTrendyol.id, productId: pKapi.id, externalId: 'TY-KAPI-001', price: 5200, stock: 8, isActive: true, lastSyncAt: new Date('2026-03-30') },
      { tenantId: tenant.id, integrationId: mpHB.id, productId: pCerceve.id, externalId: 'HB-CERC-001', price: 2750, stock: 25, isActive: true, lastSyncAt: new Date('2026-03-29') },
    ],
  });

  await prisma.marketplaceOrder.create({
    data: {
      tenantId: tenant.id, integrationId: mpTrendyol.id, externalId: 'TY-ORD-2026-0451',
      channel: 'TRENDYOL', status: 'DELIVERED', customerName: 'Ahmet Yilmaz',
      customerPhone: '+90 555 111 2233', shippingAddress: 'Kadikoy, Istanbul',
      totalAmount: 5600, orderDate: new Date('2026-03-20'),
      items: { create: [
        { tenantId: tenant.id, externalProductId: 'TY-CERC-001', productId: pCerceve.id, name: 'Aluminyum Pencere Cercevesi', quantity: 2, unitPrice: 2800, lineTotal: 5600 },
      ] },
    },
  });
  await prisma.marketplaceOrder.create({
    data: {
      tenantId: tenant.id, integrationId: mpTrendyol.id, externalId: 'TY-ORD-2026-0523',
      channel: 'TRENDYOL', status: 'PROCESSING', customerName: 'Fatma Demir',
      customerPhone: '+90 555 444 5566', shippingAddress: 'Cankaya, Ankara',
      totalAmount: 5200, orderDate: new Date('2026-03-30'),
      items: { create: [
        { tenantId: tenant.id, externalProductId: 'TY-KAPI-001', productId: pKapi.id, name: 'Aluminyum Kapi Sistemi', quantity: 1, unitPrice: 5200, lineTotal: 5200 },
      ] },
    },
  });
  await prisma.marketplaceOrder.create({
    data: {
      tenantId: tenant.id, integrationId: mpHB.id, externalId: 'HB-ORD-2026-1102',
      channel: 'HEPSIBURADA', status: 'PENDING', customerName: 'Mehmet Koc',
      customerEmail: 'mehmet@email.com', shippingAddress: 'Nilufer, Bursa',
      totalAmount: 8250, orderDate: new Date('2026-04-01'),
      items: { create: [
        { tenantId: tenant.id, externalProductId: 'HB-CERC-001', productId: pCerceve.id, name: 'Aluminyum Pencere Cercevesi', quantity: 3, unitPrice: 2750, lineTotal: 8250 },
      ] },
    },
  });
  console.log('  + Pazaryeri (entegrasyonlar, listlemeler, siparisler)');

  // ─── HR & PAYROLL ───────────────────────────

  const emp1 = await prisma.employee.create({ data: { tenantId: tenant.id, firstName: 'Hasan', lastName: 'Celik', email: 'hasan@globaluretim.com', phone: '+90 535 111 0001', position: 'CNC Operatoru', department: 'Uretim', hireDate: new Date('2023-03-15'), salary: 22000 } });
  const emp2 = await prisma.employee.create({ data: { tenantId: tenant.id, firstName: 'Zeynep', lastName: 'Arslan', email: 'zeynep@globaluretim.com', phone: '+90 535 111 0002', position: 'Kalite Kontrol', department: 'Uretim', hireDate: new Date('2024-01-10'), salary: 20000 } });
  const emp3 = await prisma.employee.create({ data: { tenantId: tenant.id, firstName: 'Murat', lastName: 'Sahin', email: 'murat@globaluretim.com', phone: '+90 535 111 0003', position: 'Boyaci', department: 'Uretim', hireDate: new Date('2024-06-01'), salary: 18000 } });
  const emp4 = await prisma.employee.create({ data: { tenantId: tenant.id, firstName: 'Selin', lastName: 'Dogan', email: 'selin@globaluretim.com', phone: '+90 535 111 0004', position: 'Muhasebe Uzmani', department: 'Finans', hireDate: new Date('2023-09-01'), salary: 25000 } });
  const emp5 = await prisma.employee.create({ data: { tenantId: tenant.id, firstName: 'Burak', lastName: 'Yilmaz', email: 'burak@globaluretim.com', phone: '+90 535 111 0005', position: 'Depo Sorumlusu', department: 'Lojistik', hireDate: new Date('2025-02-15'), salary: 19000 } });

  // Leave requests
  await prisma.leaveRequest.create({ data: { tenantId: tenant.id, employeeId: emp1.id, type: 'ANNUAL', status: 'APPROVED', startDate: new Date('2026-04-14'), endDate: new Date('2026-04-18'), days: 5, approvedBy: user3.id, approvedAt: new Date('2026-03-28') } });
  await prisma.leaveRequest.create({ data: { tenantId: tenant.id, employeeId: emp2.id, type: 'SICK', status: 'APPROVED', startDate: new Date('2026-03-20'), endDate: new Date('2026-03-21'), days: 2, approvedBy: user3.id, approvedAt: new Date('2026-03-20') } });
  await prisma.leaveRequest.create({ data: { tenantId: tenant.id, employeeId: emp3.id, type: 'ANNUAL', status: 'PENDING', startDate: new Date('2026-04-21'), endDate: new Date('2026-04-25'), days: 5, notes: 'Bayram tatili uzatma' } });

  // Attendance (son 5 gun)
  const attendanceDays = ['2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];
  for (const day of attendanceDays) {
    for (const emp of [emp1, emp2, emp3, emp4, emp5]) {
      await prisma.attendance.create({
        data: {
          tenantId: tenant.id, employeeId: emp.id, date: new Date(day),
          checkIn: new Date(`${day}T08:00:00`), checkOut: new Date(`${day}T17:00:00`),
          overtimeHours: emp.id === emp1.id ? 2 : 0,
        },
      });
    }
  }

  // Payroll — Mart 2026
  for (const emp of [emp1, emp2, emp3, emp4, emp5]) {
    const gross = Number(emp.salary);
    const sgk = gross * 0.14;
    const gelirVergisi = gross * 0.15;
    const net = gross - sgk - gelirVergisi;
    await prisma.payroll.create({
      data: {
        tenantId: tenant.id, employeeId: emp.id, period: '2026-03',
        grossSalary: gross, deductions: sgk + gelirVergisi, netSalary: net,
        paidAt: new Date('2026-04-01'),
        items: { create: [
          { tenantId: tenant.id, label: 'SGK Primi (%14)', amount: sgk, isDeduction: true },
          { tenantId: tenant.id, label: 'Gelir Vergisi (%15)', amount: gelirVergisi, isDeduction: true },
        ] },
      },
    });
  }
  console.log('  + IK & Bordro (personel, izin, puantaj, bordro)');

  // ─── ACCOUNTING & FINANCE ───────────────────

  const accs = await Promise.all([
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '100', name: 'Kasa', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '102', name: 'Bankalar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '120', name: 'Alicilar', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '150', name: 'Ilk Madde ve Malzeme', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '152', name: 'Mamuller', accountType: 'ASSET' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '320', name: 'Saticilar', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '391', name: 'Hesaplanan KDV', accountType: 'LIABILITY' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '600', name: 'Yurt Ici Satislar', accountType: 'REVENUE' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '710', name: 'Direkt Ilk Madde Giderleri', accountType: 'EXPENSE' } }),
    prisma.ledgerAccount.create({ data: { tenantId: tenant.id, code: '770', name: 'Genel Yonetim Giderleri', accountType: 'EXPENSE' } }),
  ]);

  const fp = await prisma.fiscalPeriod.create({ data: { tenantId: tenant.id, name: '2026 Q1', startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'), status: 'OPEN' } });

  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId: tenant.id, name: 'Ziraat Bankasi Vadesiz', bankName: 'Ziraat Bankasi', accountNumber: '9876543', iban: 'TR33 0001 0000 9876 5432 1098 76', currencyCode: 'TRY' },
  });
  await prisma.cashAccount.create({ data: { tenantId: tenant.id, name: 'Fabrika Kasa', currencyCode: 'TRY' } });

  // Invoice + Payment
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, contactId: cMusteri.id, type: 'SALES', status: 'PAID', number: 'INV-000001',
      date: new Date('2026-03-15'), dueDate: new Date('2026-05-15'),
      totalNet: 125000, totalTax: 25000, totalGross: 150000,
      lines: { create: [
        { tenantId: tenant.id, productId: pCerceve.id, taxRateId: kdv20.id, description: 'Aluminyum Pencere Cercevesi', quantity: 50, unitPrice: 2500, discount: 0, taxAmount: 25000, lineTotal: 150000, sortOrder: 0 },
      ] },
    },
  });
  const pay1 = await prisma.payment.create({
    data: { tenantId: tenant.id, contactId: cMusteri.id, bankAccountId: bankAccount.id, date: new Date('2026-03-25'), amount: 150000, method: 'BANK_TRANSFER', reference: 'EFT-2026-001', status: 'COMPLETED' },
  });
  await prisma.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: pay1.id, invoiceId: inv1.id, amount: 150000 } });
  console.log('  + Muhasebe, fatura, odeme');

  // ─── SETTINGS & NOTIFICATIONS ───────────────

  await prisma.tenantSetting.createMany({
    data: [
      { tenantId: tenant.id, key: 'default_currency', value: 'TRY' },
      { tenantId: tenant.id, key: 'invoice_prefix', value: 'INV' },
      { tenantId: tenant.id, key: 'date_format', value: 'DD.MM.YYYY' },
      { tenantId: tenant.id, key: 'timezone', value: 'Europe/Istanbul' },
      { tenantId: tenant.id, key: 'language', value: 'tr' },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: owner.id, title: 'Is Emri Tamamlandi', message: 'WO-000001 pencere cercevesi uretimi tamamlandi (50 adet).', module: 'production', status: 'READ', readAt: new Date('2026-03-10') },
      { tenantId: tenant.id, userId: owner.id, title: 'Yeni Pazaryeri Siparisi', message: 'Trendyol uzerinden yeni siparis alindi (TY-ORD-2026-0523).', module: 'marketplace', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user3.id, title: 'Izin Talebi Bekliyor', message: 'Murat Sahin 5 gunluk yillik izin talep etti.', module: 'hr', status: 'UNREAD' },
      { tenantId: tenant.id, userId: user2.id, title: 'Servis Talebi Acik', message: 'SR-000002 boya kabini filtre degisimi devam ediyor.', module: 'service', status: 'UNREAD' },
    ],
  });

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      { tenantId: tenant.id, userId: owner.id, module: 'production', entityType: 'WORK_ORDER', entityId: wo1.id, action: 'CREATE', createdAt: new Date('2026-02-28') },
      { tenantId: tenant.id, userId: user2.id, module: 'production', entityType: 'WORK_ORDER', entityId: wo1.id, action: 'UPDATE', newValues: { status: 'COMPLETED' }, createdAt: new Date('2026-03-10') },
      { tenantId: tenant.id, userId: owner.id, module: 'invoicing', entityType: 'INVOICE', entityId: inv1.id, action: 'CREATE', createdAt: new Date('2026-03-15') },
      { tenantId: tenant.id, userId: user3.id, module: 'hr', entityType: 'EMPLOYEE', entityId: emp1.id, action: 'UPDATE', newValues: { salary: 22000 }, createdAt: new Date('2026-03-01') },
    ],
  });

  // API Key
  const apiKeyHash = await bcrypt.hash('sk_live_global_uretim_demo_key_001', 10);
  await prisma.apiKey.create({
    data: { tenantId: tenant.id, name: 'Production API', keyHash: apiKeyHash, keyPrefix: 'sk_live_', isActive: true, scopes: ['products:read', 'products:write', 'orders:read', 'invoices:read'] },
  });

  console.log('  + Enterprise Tenant: Global Uretim Sanayi A.S. (ent@globaluretim.com / demo1234)');
}
