import { DeliveryNoteStatus, EntityType, PrismaClient } from '@prisma/client';

export type DataQualitySeverity = 'critical' | 'high' | 'medium' | 'low';
export type DataQualityCategory = 'contacts' | 'inventory' | 'hr' | 'sales';

export interface DataQualityIssue {
  key: string;
  category: DataQualityCategory;
  severity: DataQualitySeverity;
  title: string;
  description: string;
  count: number;
  scoreImpact: number;
  actionLabel: string;
  href: string;
  sampleRecords: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
}

export interface DataQualitySummary {
  score: number;
  issueCount: number;
  criticalCount: number;
  generatedAt: string;
  issues: DataQualityIssue[];
}

interface ContactDuplicateCandidate {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  taxNumber: string | null;
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('tr-TR');
  return normalized ? normalized : null;
}

function sample<T>(rows: readonly T[], mapper: (row: T) => DataQualityIssue['sampleRecords'][number]): DataQualityIssue['sampleRecords'] {
  return rows.slice(0, 5).map(mapper);
}

function buildIssue(input: Omit<DataQualityIssue, 'count'> & { count: number }): DataQualityIssue | null {
  if (input.count <= 0) return null;
  return input;
}

function duplicateContactGroups(rows: readonly ContactDuplicateCandidate[]): ContactDuplicateCandidate[][] {
  const groups = new Map<string, ContactDuplicateCandidate[]>();
  for (const row of rows) {
    const key = normalizeKey(row.taxNumber) ?? normalizeKey(row.email) ?? normalizeKey(row.name);
    if (!key) continue;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function qualityScore(issues: readonly DataQualityIssue[]): number {
  const penalty = issues.reduce((sum, issue) => sum + Math.min(issue.scoreImpact, issue.count * issue.scoreImpact), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export async function getDataQualitySummary(db: PrismaClient, tenantId: string): Promise<DataQualitySummary> {
  const [
    contactsMissingEmail,
    contactsMissingTaxNumber,
    productsWithoutMinStock,
    productsWithoutPriceOrCost,
    negativeStockLevels,
    activeEmployees,
    employeeDocumentAttachments,
    shippedDeliveryNotes,
    contactsForDuplicateCheck,
  ] = await db.$transaction([
    db.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true, OR: [{ email: null }, { email: '' }] },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: 50,
    }),
    db.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true, OR: [{ taxNumber: null }, { taxNumber: '' }] },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: 50,
    }),
    db.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true, minStockLevel: { lte: 0 } },
      select: { id: true, code: true, name: true, minStockLevel: true },
      orderBy: { code: 'asc' },
      take: 50,
    }),
    db.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [
          { salesPrice: { lte: 0 } },
          { purchasePrice: { lte: 0 } },
          { averageCost: { lte: 0 } },
        ],
      },
      select: { id: true, code: true, name: true, salesPrice: true, purchasePrice: true, averageCost: true },
      orderBy: { code: 'asc' },
      take: 50,
    }),
    db.stockLevel.findMany({
      where: { tenantId, quantity: { lt: 0 } },
      select: {
        id: true,
        quantity: true,
        product: { select: { code: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    db.employee.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, position: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    }),
    db.attachment.findMany({
      where: { tenantId, entityType: EntityType.EMPLOYEE, documentKind: 'EMPLOYEE_DOCUMENT' },
      select: { entityId: true },
      take: 2_000,
    }),
    db.deliveryNote.findMany({
      where: { tenantId, deletedAt: null, status: { in: [DeliveryNoteStatus.SHIPPED, DeliveryNoteStatus.DELIVERED] } },
      select: { id: true, number: true, status: true, eDocuments: { select: { id: true }, take: 1 } },
      orderBy: { date: 'desc' },
      take: 50,
    }),
    db.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true, email: true, taxNumber: true },
      orderBy: { name: 'asc' },
      take: 2_000,
    }),
  ]);

  const employeeIdsWithDocuments = new Set(employeeDocumentAttachments.map((attachment) => attachment.entityId));
  const employeesMissingDocuments = activeEmployees.filter((employee) => !employeeIdsWithDocuments.has(employee.id));
  const deliveryNotesWithoutEDocument = shippedDeliveryNotes.filter((note) => note.eDocuments.length === 0);
  const duplicateGroups = duplicateContactGroups(contactsForDuplicateCheck);
  const duplicateContactCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);

  const issues = [
    buildIssue({
      key: 'contacts.missing_email',
      category: 'contacts',
      severity: 'medium',
      title: 'E-posta adresi eksik cariler',
      description: 'Mail, hatırlatma ve toplu iletişim akışları için cari e-posta bilgisi tamamlanmalı.',
      count: contactsMissingEmail.length,
      scoreImpact: 2,
      actionLabel: 'Cari listesini aç',
      href: '/dashboard/contacts',
      sampleRecords: sample(contactsMissingEmail, (contact) => ({
        id: contact.id,
        label: contact.name,
        detail: contact.code ? `Kod: ${contact.code}` : 'Kod yok',
      })),
    }),
    buildIssue({
      key: 'contacts.missing_tax_number',
      category: 'contacts',
      severity: 'high',
      title: 'Vergi numarası eksik cariler',
      description: 'E-belge, muhasebe ve mutabakat süreçleri için vergi bilgileri tamamlanmalı.',
      count: contactsMissingTaxNumber.length,
      scoreImpact: 3,
      actionLabel: 'Cari listesini aç',
      href: '/dashboard/contacts',
      sampleRecords: sample(contactsMissingTaxNumber, (contact) => ({
        id: contact.id,
        label: contact.name,
        detail: contact.code ? `Kod: ${contact.code}` : 'Kod yok',
      })),
    }),
    buildIssue({
      key: 'inventory.missing_min_stock',
      category: 'inventory',
      severity: 'medium',
      title: 'Minimum stok eşiği tanımsız ürünler',
      description: 'Satın alma önerileri ve kritik stok uyarıları için minimum stok eşiği belirlenmeli.',
      count: productsWithoutMinStock.length,
      scoreImpact: 2,
      actionLabel: 'Ürün listesini aç',
      href: '/dashboard/products',
      sampleRecords: sample(productsWithoutMinStock, (product) => ({
        id: product.id,
        label: product.name,
        detail: `Kod: ${product.code}`,
      })),
    }),
    buildIssue({
      key: 'inventory.negative_stock',
      category: 'inventory',
      severity: 'critical',
      title: 'Eksiye düşen stoklar',
      description: 'Eksi stok maliyet, sevkiyat ve rezervasyon tutarlılığını bozar.',
      count: negativeStockLevels.length,
      scoreImpact: 5,
      actionLabel: 'Stok seviyelerini aç',
      href: '/dashboard/stock/levels',
      sampleRecords: sample(negativeStockLevels, (level) => ({
        id: level.id,
        label: `${level.product.code} - ${level.product.name}`,
        detail: `${level.warehouse.code} / ${Number(level.quantity).toFixed(3)}`,
      })),
    }),
    buildIssue({
      key: 'inventory.missing_price_cost',
      category: 'inventory',
      severity: 'high',
      title: 'Fiyat veya maliyeti eksik ürünler',
      description: 'Satış fiyatı, alış fiyatı veya ortalama maliyeti olmayan ürünler karlılık ve stok değerleme raporlarını bozar.',
      count: productsWithoutPriceOrCost.length,
      scoreImpact: 3,
      actionLabel: 'Ürün listesini aç',
      href: '/dashboard/products',
      sampleRecords: sample(productsWithoutPriceOrCost, (product) => ({
        id: product.id,
        label: product.name,
        detail: `Kod: ${product.code} / Satış: ${Number(product.salesPrice).toFixed(2)} / Alış: ${Number(product.purchasePrice).toFixed(2)} / Maliyet: ${Number(product.averageCost).toFixed(4)}`,
      })),
    }),
    buildIssue({
      key: 'hr.missing_employee_document',
      category: 'hr',
      severity: 'high',
      title: 'Evrakı eksik personeller',
      description: 'Personel evrakları doküman merkezi üzerinden takip edilmeli.',
      count: employeesMissingDocuments.length,
      scoreImpact: 3,
      actionLabel: 'Personel listesini aç',
      href: '/dashboard/hr/employees',
      sampleRecords: sample(employeesMissingDocuments, (employee) => ({
        id: employee.id,
        label: `${employee.firstName} ${employee.lastName}`,
        detail: employee.position ?? 'Pozisyon yok',
      })),
    }),
    buildIssue({
      key: 'sales.shipment_without_document',
      category: 'sales',
      severity: 'high',
      title: 'E-belgesi olmayan sevkiyatlar',
      description: 'Sevk edilen irsaliyelerin e-belge bağlantısı kontrol edilmeli.',
      count: deliveryNotesWithoutEDocument.length,
      scoreImpact: 3,
      actionLabel: 'İrsaliyeleri aç',
      href: '/dashboard/delivery-notes',
      sampleRecords: sample(deliveryNotesWithoutEDocument, (note) => ({
        id: note.id,
        label: note.number,
        detail: `Durum: ${note.status}`,
      })),
    }),
    buildIssue({
      key: 'contacts.duplicate_contact',
      category: 'contacts',
      severity: 'high',
      title: 'Tekrarlı cari adayları',
      description: 'Aynı vergi numarası, e-posta veya unvana sahip cari kartları birleştirilmeli.',
      count: duplicateContactCount,
      scoreImpact: 3,
      actionLabel: 'Cari listesini aç',
      href: '/dashboard/contacts',
      sampleRecords: duplicateGroups.slice(0, 5).map((group) => ({
        id: group[0]?.id ?? 'duplicate',
        label: group.map((contact) => contact.name).join(' / '),
        detail: `${group.length} benzer kayıt`,
      })),
    }),
  ].filter((issue): issue is DataQualityIssue => issue !== null);

  return {
    score: qualityScore(issues),
    issueCount: issues.reduce((sum, issue) => sum + issue.count, 0),
    criticalCount: issues.filter((issue) => issue.severity === 'critical').reduce((sum, issue) => sum + issue.count, 0),
    generatedAt: new Date().toISOString(),
    issues,
  };
}
