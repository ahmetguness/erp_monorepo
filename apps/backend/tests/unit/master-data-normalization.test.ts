import { describe, expect, it } from 'vitest';
import {
  generatedProductCode,
  normalizeBarcode,
  normalizeEmail,
  normalizeIban,
  normalizePhone,
  normalizeTaxNumber,
} from '../../src/modules/platform/application/master-data-enrichment/master-data-normalization.js';
import {
  bankAccountMasterDataEnrichmentSchema,
  contactMasterDataEnrichmentSchema,
  productMasterDataEnrichmentSchema,
} from '../../src/modules/platform/application/master-data-enrichment/master-data-enrichment.schema.js';

describe('master data normalization', () => {
  it('iletişim ve vergi alanlarını güvenli biçimde normalize eder', () => {
    expect(normalizeTaxNumber('123 456 7890')).toBe('1234567890');
    expect(normalizeTaxNumber('123')).toBeNull();
    expect(normalizeEmail(' Sales@Example.COM ')).toBe('sales@example.com');
    expect(normalizeEmail('invalid')).toBeNull();
    expect(normalizePhone('00 90 (532) 123 45 67')).toBe('+905321234567');
  });

  it('ürün barkodunu doğrular ve kararlı bir ürün kodu üretir', () => {
    expect(normalizeBarcode(' 8690000123456 ')).toBe('8690000123456');
    expect(normalizeBarcode('!')).toBeNull();
    expect(generatedProductCode('8690000123456')).toBe('PRD-00123456');
  });

  it('IBAN değerini boşluklardan arındırıp mod-97 ile doğrular', () => {
    expect(normalizeIban('TR33 0006 1005 1978 6457 8413 26')).toBe('TR330006100519786457841326');
    expect(normalizeIban('TR00 0006 1005 1978 6457 8413 26')).toBeNull();
  });
});

describe('master data enrichment request schemas', () => {
  it('her varlık için gerçekten kullanılabilen arama alanını zorunlu tutar', () => {
    expect(contactMasterDataEnrichmentSchema.safeParse({ entityType: 'contact', name: 'Örnek' }).success).toBe(false);
    expect(contactMasterDataEnrichmentSchema.safeParse({ entityType: 'contact', email: 'info@example.com' }).success).toBe(true);
    expect(productMasterDataEnrichmentSchema.safeParse({ entityType: 'product', name: 'Ürün' }).success).toBe(false);
    expect(productMasterDataEnrichmentSchema.safeParse({ entityType: 'product', barcode: '8690000123456' }).success).toBe(true);
    expect(bankAccountMasterDataEnrichmentSchema.safeParse({ entityType: 'bankAccount', iban: 'TR330006100519786457841326' }).success).toBe(true);
  });

  it('endpoint ile uyuşmayan varlık türünü reddeder', () => {
    expect(contactMasterDataEnrichmentSchema.safeParse({ entityType: 'product', email: 'info@example.com' }).success).toBe(false);
  });
});
