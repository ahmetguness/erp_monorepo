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

    const delegate = prisma[modelName] as unknown as {
      findFirst: (args: { where: { tenantId: string; number: string }; select: { id: true } }) => Promise<{ id: string } | null>;
    };

    const exists = await delegate.findFirst({
      where: { tenantId, number: candidate },
      select: { id: true }
    });

    if (!exists) return candidate;

    // Çakışma var — loop devam edecek, sequence bir daha artacak
  }

  // Tüm denemeler başarısız — timestamp fallback
  return `${prefix}${Date.now()}`;
}
