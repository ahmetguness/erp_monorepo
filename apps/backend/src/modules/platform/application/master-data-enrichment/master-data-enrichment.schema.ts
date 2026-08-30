import { z } from 'zod';
import { MASTER_DATA_ENTITY_TYPES } from './master-data-enrichment.types.js';

const optionalText = z.string().trim().max(250).optional();

export const masterDataEnrichmentSchema = z.object({
  entityType: z.enum(MASTER_DATA_ENTITY_TYPES),
  taxNumber: optionalText,
  email: optionalText,
  phone: optionalText,
  barcode: optionalText,
  iban: optionalText,
  name: optionalText,
}).strict().refine((value) => Boolean(value.taxNumber || value.email || value.phone || value.barcode || value.iban || value.name), {
  message: 'En az bir arama alanı gereklidir.',
});

export const contactMasterDataEnrichmentSchema = masterDataEnrichmentSchema
  .refine((value) => value.entityType === 'contact', { message: 'Cari zenginleştirme isteği bekleniyor.' })
  .refine((value) => Boolean(value.taxNumber || value.email || value.phone), {
    message: 'Cari doğrulaması için vergi numarası, e-posta veya telefon gereklidir.',
  });

export const productMasterDataEnrichmentSchema = masterDataEnrichmentSchema
  .refine((value) => value.entityType === 'product', { message: 'Ürün zenginleştirme isteği bekleniyor.' })
  .refine((value) => Boolean(value.barcode), { message: 'Ürün doğrulaması için barkod gereklidir.' });

export const bankAccountMasterDataEnrichmentSchema = masterDataEnrichmentSchema
  .refine((value) => value.entityType === 'bankAccount', { message: 'Banka hesabı zenginleştirme isteği bekleniyor.' })
  .refine((value) => Boolean(value.iban), { message: 'Banka hesabı doğrulaması için IBAN gereklidir.' });
