import { PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";

const validDate = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    "Geçerli tarih zorunludur.",
  );

const createSchema = z
  .object({
    contactId: z.string().trim().min(1).max(64),
    date: validDate,
    dueDate: validDate.optional(),
    notes: z.string().trim().max(2000).optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(64),
            description: z.string().trim().max(500).optional(),
            quantity: z.number().finite().positive().max(1_000_000_000),
            unitPrice: z.number().finite().nonnegative().max(1_000_000_000_000),
            discount: z.number().finite().min(0).max(100).optional(),
            taxRate: z.number().finite().min(0).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueDate && new Date(value.dueDate) < new Date(value.date))
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Teslim tarihi sipariş tarihinden önce olamaz.",
      });
    const productIds = value.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Aynı ürün siparişte yalnızca bir kez bulunabilir.",
      });
  });

const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().max(200).optional(),
    status: z.nativeEnum(PurchaseOrderStatus).optional(),
    contactId: z.string().trim().min(1).max(64).optional(),
    dateFrom: validDate.optional(),
    dateTo: validDate.optional(),
    dueFrom: validDate.optional(),
    dueTo: validDate.optional(),
    minTotal: z.coerce.number().finite().nonnegative().optional(),
    maxTotal: z.coerce.number().finite().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [from, to, path] of [
      [value.dateFrom, value.dateTo, "dateTo"],
      [value.dueFrom, value.dueTo, "dueTo"],
    ] as const) {
      if (from && to && new Date(from) > new Date(to))
        context.addIssue({
          code: "custom",
          path: [path],
          message: "Bitiş tarihi başlangıçtan önce olamaz.",
        });
    }
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

export type PurchaseOrderCreateInput = z.infer<typeof createSchema>;
export const parsePurchaseOrderCreate = (
  value: unknown,
): PurchaseOrderCreateInput | null => {
  const result = createSchema.safeParse(value);
  return result.success ? result.data : null;
};
export const parsePurchaseOrderList = (value: unknown) => {
  const result = listSchema.safeParse(value);
  return result.success ? result.data : null;
};
