import type { PrismaClient } from '@prisma/client';
import {
  generatedProductCode,
  normalizeBarcode,
  normalizeEmail,
  normalizePhone,
  normalizeIban,
  normalizeTaxNumber,
} from '../../application/master-data-enrichment/master-data-normalization.js';
import type {
  CompanyRegistryPort,
  MasterDataEnrichmentInput,
  MasterDataEnrichmentResult,
  MasterDataSuggestion,
  RegistryCompanyCandidate,
} from '../../application/master-data-enrichment/master-data-enrichment.types.js';

function suggestion(field: MasterDataSuggestion['field'], value: string, source: MasterDataSuggestion['source'], sourceLabel: string, confidence: number, reason: string): MasterDataSuggestion {
  return { field, value, source, sourceLabel, confidence, reason };
}

export class MasterDataEnrichmentService {
  constructor(private readonly db: PrismaClient, private readonly registry: CompanyRegistryPort) {}

  async preview(tenantId: string, input: MasterDataEnrichmentInput): Promise<MasterDataEnrichmentResult> {
    if (input.entityType === 'contact') return this.previewContact(tenantId, input);
    if (input.entityType === 'product') return this.previewProduct(tenantId, input);
    return this.previewBankAccount(tenantId, input);
  }

  private async previewContact(tenantId: string, input: MasterDataEnrichmentInput): Promise<MasterDataEnrichmentResult> {
    const taxNumber = normalizeTaxNumber(input.taxNumber);
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const suggestions: MasterDataSuggestion[] = [];
    const warnings: string[] = [];
    if (input.taxNumber && !taxNumber) warnings.push('Vergi/TCKN numarası 10 veya 11 rakam olmalıdır.');
    if (input.email && !email) warnings.push('E-posta biçimi geçerli değil.');
    if (input.phone && !phone) warnings.push('Telefon numarası doğrulanamadı.');
    if (taxNumber && taxNumber !== input.taxNumber) suggestions.push(suggestion('taxNumber', taxNumber, 'normalization', 'Biçim doğrulama', 1, 'Ayraçlar kaldırıldı ve uzunluk doğrulandı.'));
    if (email && email !== input.email) suggestions.push(suggestion('email', email, 'normalization', 'Biçim doğrulama', 1, 'E-posta küçük harfe ve standart biçime getirildi.'));
    if (phone && phone !== input.phone) suggestions.push(suggestion('phone', phone, 'normalization', 'Biçim doğrulama', 0.98, 'Telefon ayraçları temizlendi.'));

    const duplicates = await this.db.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          ...(taxNumber ? [{ taxNumber }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: { id: true, name: true, taxNumber: true, email: true },
      take: 5,
    });
    const mappedDuplicates = duplicates.map((contact) => ({
      id: contact.id,
      label: contact.name,
      matchedBy: contact.taxNumber === taxNumber ? 'taxNumber' as const : 'email' as const,
      href: `/dashboard/contacts/${contact.id}`,
    }));
    if (mappedDuplicates.length > 0) warnings.push('Aynı kimlik bilgileriyle kayıtlı bir cari bulundu; yeni kayıt oluşturmadan önce kontrol edin.');

    if (taxNumber && mappedDuplicates.length === 0) {
      const external = await this.registry.findByTaxNumber(taxNumber);
      if (external) suggestions.push(...this.registrySuggestions(external));
    }
    return { entityType: 'contact', suggestions, duplicates: mappedDuplicates, warnings, generatedAt: new Date().toISOString() };
  }

  private async previewProduct(tenantId: string, input: MasterDataEnrichmentInput): Promise<MasterDataEnrichmentResult> {
    const barcode = normalizeBarcode(input.barcode);
    const suggestions: MasterDataSuggestion[] = [];
    const warnings: string[] = [];
    if (input.barcode && !barcode) warnings.push('Barkod 6-32 karakter arasında ve yalnızca harf, rakam veya tire içermelidir.');
    const duplicate = barcode ? await this.db.product.findFirst({ where: { tenantId, barcode, deletedAt: null }, select: { id: true, name: true } }) : null;
    if (duplicate) warnings.push('Bu barkod tenant içinde başka bir üründe kullanılıyor.');
    if (barcode && !duplicate) {
      const code = await this.uniqueProductCode(tenantId, generatedProductCode(barcode));
      suggestions.push(suggestion('code', code, 'generated', 'Barkod kod üreticisi', 1, 'Barkoddan tenant içinde benzersiz ürün kodu üretildi.'));
    }
    return {
      entityType: 'product',
      suggestions,
      duplicates: duplicate ? [{ id: duplicate.id, label: duplicate.name, matchedBy: 'barcode', href: `/dashboard/products/${duplicate.id}` }] : [],
      warnings,
      generatedAt: new Date().toISOString(),
    };
  }

  private registrySuggestions(candidate: RegistryCompanyCandidate): MasterDataSuggestion[] {
    const fields = ['name', 'taxOffice', 'address', 'city', 'country'] as const;
    return fields.flatMap((field) => candidate[field]
      ? [suggestion(field, candidate[field], 'external-registry', 'Yapılandırılmış şirket sicil sağlayıcısı', 0.9, 'Dış kaynaktan bulundu; kaydetmeden önce doğrulayın.')]
      : []);
  }

  private async previewBankAccount(tenantId: string, input: MasterDataEnrichmentInput): Promise<MasterDataEnrichmentResult> {
    const iban = normalizeIban(input.iban);
    const suggestions: MasterDataSuggestion[] = [];
    const warnings: string[] = [];
    if (input.iban && !iban) warnings.push('IBAN biçimi veya kontrol basamakları geçerli değil.');
    const duplicate = iban ? await this.db.bankAccount.findFirst({ where: { tenantId, iban, deletedAt: null }, select: { id: true, name: true } }) : null;
    if (duplicate) warnings.push('Bu IBAN tenant içinde kayıtlı bir banka hesabında kullanılıyor.');
    if (iban) {
      if (iban !== input.iban) suggestions.push(suggestion('iban', iban, 'normalization', 'ISO 13616 doğrulaması', 1, 'IBAN boşluklardan arındırıldı ve mod-97 kontrolü geçti.'));
      const country = iban.slice(0, 2);
      const currency = country === 'TR' ? 'TRY' : country === 'GB' ? 'GBP' : 'EUR';
      suggestions.push(suggestion('currencyCode', currency, 'generated', 'IBAN ülke kodu', 0.95, `${country} ülke kodundan para birimi önerildi.`));
      const bankName = this.turkishBankName(iban);
      if (bankName) suggestions.push(suggestion('bankName', bankName, 'generated', 'TCMB banka kodu eşlemesi', 0.95, 'IBAN içindeki banka kodundan banka adı bulundu.'));
    }
    return {
      entityType: 'bankAccount',
      suggestions,
      duplicates: duplicate ? [{ id: duplicate.id, label: duplicate.name, matchedBy: 'iban', href: '/dashboard/payments/bank-accounts' }] : [],
      warnings,
      generatedAt: new Date().toISOString(),
    };
  }

  private turkishBankName(iban: string): string | null {
    if (!iban.startsWith('TR') || iban.length !== 26) return null;
    const banks: Readonly<Record<string, string>> = { '00010': 'Ziraat Bankası', '00012': 'Halkbank', '00015': 'VakıfBank', '00032': 'TEB', '00046': 'Akbank', '00062': 'Garanti BBVA', '00064': 'İş Bankası', '00067': 'Yapı Kredi' };
    return banks[iban.slice(4, 9)] ?? null;
  }

  private async uniqueProductCode(tenantId: string, baseCode: string): Promise<string> {
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const code = suffix === 0 ? baseCode : `${baseCode}-${suffix}`;
      const exists = await this.db.product.findUnique({ where: { tenantId_code: { tenantId, code } }, select: { id: true } });
      if (!exists) return code;
    }
    return `${baseCode}-${Date.now().toString(36).toUpperCase()}`;
  }
}
