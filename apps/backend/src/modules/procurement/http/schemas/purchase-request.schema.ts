import { PurchaseRequestStatus } from "@prisma/client";
import { z } from "zod";

const validDate = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "Geçerli bir tarih zorunludur.",
  );
const productId = z.string().trim().min(1).max(64);

const createSchema = z
  .object({
    date: validDate,
    notes: z.string().trim().max(2000).optional(),
    items: z
      .array(
        z
          .object({
            productId,
            description: z.string().trim().max(500).optional(),
            quantity: z.number().finite().positive().max(1_000_000_000),
            unitPrice: z
              .number()
              .finite()
              .nonnegative()
              .max(1_000_000_000_000)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Aynı ürün bir talepte yalnızca bir kez bulunabilir.",
      });
  });

const convertSchema = z
  .object({
    contactId: z.string().trim().min(1).max(64),
    items: z
      .array(
        z
          .object({
            productId,
            unitPrice: z.number().finite().nonnegative().max(1_000_000_000_000),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.items?.map((item) => item.productId) ?? [];
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Aynı ürün için birden fazla fiyat verilemez.",
      });
  });

const transitionSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().max(200).optional(),
    status: z.nativeEnum(PurchaseRequestStatus).optional(),
    dateFrom: validDate.optional(),
    dateTo: validDate.optional(),
    minTotal: z.coerce.number().finite().nonnegative().optional(),
    maxTotal: z.coerce.number().finite().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.dateFrom &&
      value.dateTo &&
      new Date(value.dateFrom) > new Date(value.dateTo)
    )
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "Bitiş tarihi başlangıçtan önce olamaz.",
      });
    if (
      value.minTotal !== undefined &&
      value.maxTotal !== undefined &&
      value.minTotal > value.maxTotal
    )
      context.addIssue({
        code: "custom",
        path: ["maxTotal"],
        message: "Maksimum tutar minimumdan küçük olamaz.",
      });
  });

export type PurchaseRequestCreateInput = z.infer<typeof createSchema>;
export type PurchaseRequestConvertInput = z.infer<typeof convertSchema>;
export type PurchaseRequestListInput = z.infer<typeof listSchema>;
export type PurchaseRequestTransitionInput = z.infer<typeof transitionSchema>;

export const parsePurchaseRequestCreate = (
  value: unknown,
): PurchaseRequestCreateInput | null => {
  const result = createSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const parsePurchaseRequestConvert = (
  value: unknown,
): PurchaseRequestConvertInput | null => {
  const result = convertSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const parsePurchaseRequestList = (
  value: unknown,
): PurchaseRequestListInput | null => {
  const result = listSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const parsePurchaseRequestTransition = (
  value: unknown,
): PurchaseRequestTransitionInput | null => {
  const result = transitionSchema.safeParse(value);
  return result.success ? result.data : null;
};
