import { prisma } from '../lib/prisma';

export type DocumentModelName = 
  | 'invoice' 
  | 'salesOrder' 
  | 'salesQuote'
  | 'purchaseOrder' 
  | 'purchaseRequest'
  | 'journalEntry' 
  | 'deliveryNote' 
  | 'serviceRequest' 
  | 'stockCount' 
  | 'workOrder';

async function documentNumberExists(
  tenantId: string,
  number: string,
  modelName: DocumentModelName,
): Promise<boolean> {
  const where = { tenantId, number };
  const select = { id: true } as const;

  switch (modelName) {
    case 'invoice':
      return Boolean(await prisma.invoice.findFirst({ where, select }));
    case 'salesOrder':
      return Boolean(await prisma.salesOrder.findFirst({ where, select }));
    case 'salesQuote':
      return Boolean(await prisma.salesQuote.findFirst({ where, select }));
    case 'purchaseOrder':
      return Boolean(await prisma.purchaseOrder.findFirst({ where, select }));
    case 'purchaseRequest':
      return Boolean(await prisma.purchaseRequest.findFirst({ where, select }));
    case 'journalEntry':
      return Boolean(await prisma.journalEntry.findFirst({ where, select }));
    case 'deliveryNote':
      return Boolean(await prisma.deliveryNote.findFirst({ where, select }));
    case 'serviceRequest':
      return Boolean(await prisma.serviceRequest.findFirst({ where, select }));
    case 'stockCount':
      return Boolean(await prisma.stockCount.findFirst({ where, select }));
    case 'workOrder':
      return Boolean(await prisma.workOrder.findFirst({ where, select }));
  }
}

/**
 * Benzersiz belge numarası üretir.
 * NumberSequence tablosunu kullanır, çakışma durumunda retry yapar.
 *
 * @param tenantId - Tenant ID
 * @param module - Modül adı (invoice, sales_order, vb.)
 * @param prefix - Numara öneki (INV-, SIP-, vb.)
 * @param modelName - Kontrol edilecek Prisma modeli
 */
export async function generateDocumentNumber(
  tenantId: string,
  module: string,
  prefix: string,
  modelName: DocumentModelName,
): Promise<string> {
  const MAX_RETRIES = 5;
  const PADDING = 6;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seq = await prisma.numberSequence.upsert({
      where: { tenantId_module: { tenantId, module } },
      create: { tenantId, module, prefix, lastNum: 1, padding: PADDING },
      update: { lastNum: { increment: 1 } },
    });

    const candidate = `${seq.prefix}${String(seq.lastNum).padStart(seq.padding, '0')}`;

    if (!(await documentNumberExists(tenantId, candidate, modelName))) return candidate;

    // Çakışma var — loop devam edecek, sequence bir daha artacak
  }

  // Tüm denemeler başarısız — timestamp fallback
  return `${prefix}${Date.now()}`;
}
