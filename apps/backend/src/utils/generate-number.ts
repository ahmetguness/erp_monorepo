import { prisma } from '../lib/prisma';

/**
 * Benzersiz belge numarası üretir.
 * NumberSequence tablosunu kullanır, çakışma durumunda retry yapar.
 *
 * @param tenantId - Tenant ID
 * @param module - Modül adı (invoice, sales_order, vb.)
 * @param prefix - Numara öneki (INV-, SIP-, vb.)
 * @param existsCheck - Çakışma kontrolü fonksiyonu
 */
export async function generateDocumentNumber(
  tenantId: string,
  module: string,
  prefix: string,
  existsCheck: (tenantId: string, number: string) => Promise<boolean>,
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

    const exists = await existsCheck(tenantId, candidate);
    if (!exists) return candidate;

    // Çakışma var — loop devam edecek, sequence bir daha artacak
  }

  // Tüm denemeler başarısız — timestamp fallback
  return `${prefix}${Date.now()}`;
}
