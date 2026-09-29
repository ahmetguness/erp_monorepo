import { z } from "zod";

const requiredText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(1000).nullable().optional();

export const createWarehouseBodySchema = z
  .object({
    code: requiredText.max(50),
    name: requiredText,
    address: optionalText,
  })
  .strict();

export const updateWarehouseBodySchema = z
  .object({
    name: requiredText.optional(),
    address: optionalText,
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    "En az bir alan gönderilmelidir.",
  );

export const transferStockBodySchema = z
  .object({
    productId: requiredText,
    fromWarehouseId: requiredText,
    toWarehouseId: requiredText,
    quantity: z.number().finite().positive().max(999_999_999),
    fromLocationId: requiredText.optional(),
    toLocationId: requiredText.optional(),
    notes: optionalText,
  })
  .strict();

export const createLocationBodySchema = z
  .object({
    name: requiredText,
    code: requiredText.max(50),
  })
  .strict();

export type CreateWarehouseBody = z.infer<typeof createWarehouseBodySchema>;
export type UpdateWarehouseBody = z.infer<typeof updateWarehouseBodySchema>;
export type TransferStockBody = z.infer<typeof transferStockBodySchema>;
export type CreateLocationBody = z.infer<typeof createLocationBodySchema>;
