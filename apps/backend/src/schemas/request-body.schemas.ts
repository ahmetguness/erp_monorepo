import { InvoiceStatus, InvoiceType, MovementType, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1, 'Zorunlu alan');
const optionalString = z.string().trim().optional();
const positiveNumber = z.number().finite().positive('0dan buyuk olmalidir.');
const nonNegativeNumber = z.number().finite().nonnegative('Negatif olamaz.');
const jsonValue = z.json();

export const loginBodySchema = z.object({
  email: nonEmptyString.email('Gecerli bir e-posta girin.'),
  password: nonEmptyString,
  tenantSlug: optionalString,
  rememberMe: z.boolean().optional(),
}).strict();

export const registerBodySchema = z.object({
  email: nonEmptyString.email('Gecerli bir e-posta girin.'),
  name: nonEmptyString,
  password: nonEmptyString,
  companyName: nonEmptyString,
  phone: optionalString,
}).strict();

export const invoiceLineBodySchema = z.object({
  productId: optionalString,
  taxRateId: optionalString,
  withholdingRateId: optionalString,
  description: nonEmptyString,
  quantity: positiveNumber,
  unitPrice: nonNegativeNumber,
  discount: z.number().finite().min(0).max(100).optional(),
}).strict();

export const createInvoiceBodySchema = z.object({
  contactId: nonEmptyString,
  type: z.nativeEnum(InvoiceType),
  salesOrderId: optionalString,
  purchaseOrderId: optionalString,
  number: optionalString,
  date: nonEmptyString,
  dueDate: optionalString,
  notes: optionalString,
  lines: z.array(invoiceLineBodySchema).min(1, 'En az bir satir zorunludur.'),
}).strict();

export const updateInvoiceBodySchema = z.object({
  dueDate: optionalString,
  notes: optionalString,
  status: z.nativeEnum(InvoiceStatus).optional(),
}).strict();

export const createPaymentBodySchema = z.object({
  contactId: optionalString,
  bankAccountId: optionalString,
  cashAccountId: optionalString,
  date: nonEmptyString,
  amount: positiveNumber,
  method: z.nativeEnum(PaymentMethod),
  direction: z.enum(['RECEIVE', 'SEND']).optional(),
  reference: optionalString,
  notes: optionalString,
  allocations: z.array(z.object({
    invoiceId: nonEmptyString,
    amount: positiveNumber,
  }).strict()).optional(),
}).strict();

export const cancelReasonBodySchema = z.object({
  reason: nonEmptyString,
}).strict();

export const createStockMovementBodySchema = z.object({
  productId: nonEmptyString,
  type: z.nativeEnum(MovementType),
  quantity: positiveNumber,
  warehouseId: nonEmptyString,
  unitCost: nonNegativeNumber.optional(),
  lotId: optionalString,
  batchId: optionalString,
  notes: optionalString,
}).strict();

export const createStockCountBodySchema = z.object({
  warehouseId: nonEmptyString,
  date: nonEmptyString,
  notes: optionalString,
  items: z.array(z.object({
    productId: nonEmptyString,
    locationId: optionalString,
    expectedQty: nonNegativeNumber,
    countedQty: nonNegativeNumber,
  }).strict()).min(1, 'En az bir kalem zorunludur.'),
}).strict();

export const finalizeStockCountBodySchema = z.object({
  applyAdjustments: z.boolean(),
  approvalReason: optionalString,
}).strict();

export const createUserBodySchema = z.object({
  email: nonEmptyString.email('Gecerli bir e-posta girin.'),
  name: nonEmptyString,
  phone: optionalString,
  password: nonEmptyString,
  roleId: optionalString,
}).strict();

export const updateUserBodySchema = z.object({
  name: optionalString,
  phone: optionalString,
  isActive: z.boolean().optional(),
  roleId: optionalString,
}).strict();

export const tenantSettingBodySchema = z.object({
  key: nonEmptyString,
  value: z.string(),
}).strict();

export const businessRuleBodySchema = z.object({
  key: nonEmptyString,
  value: jsonValue,
}).strict();

export const moduleSettingBodySchema = z.object({
  module: nonEmptyString,
  key: nonEmptyString,
  value: z.string(),
}).strict();

export const salesTargetBodySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-MM formatinda olmalidir.'),
  targetAmount: nonNegativeNumber,
}).strict();

export const productQuickImportBodySchema = z.object({
  csv: z.string(),
  partialImport: z.boolean().optional(),
}).strict();

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceBodySchema>;
export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;
export type CreateStockMovementBody = z.infer<typeof createStockMovementBodySchema>;
export type CreateStockCountBody = z.infer<typeof createStockCountBodySchema>;
export type FinalizeStockCountBody = z.infer<typeof finalizeStockCountBodySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type SalesTargetBody = z.infer<typeof salesTargetBodySchema>;
export type ProductQuickImportBody = z.infer<typeof productQuickImportBodySchema>;

export const createCollectionReminderBodySchema = z.object({
  contactId: nonEmptyString,
  invoiceId: optionalString,
  amount: positiveNumber,
  dueDate: nonEmptyString,
  notes: optionalString,
}).strict();

export type CreateCollectionReminderBody = z.infer<typeof createCollectionReminderBodySchema>;
