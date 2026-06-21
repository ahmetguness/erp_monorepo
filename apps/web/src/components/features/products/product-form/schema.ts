import { z } from "zod";
import {
  optionalText,
  parseMoneyInput,
  parseQuantityInput,
} from "@/lib/form-standard";
import type { CreateProductDTO, Product } from "@/services/product.service";

export const productSchema = z.object({
  code: z.string().min(1, "Kod zorunludur"),
  name: z.string().min(1, "Ad zorunludur"),
  unitId: z.string().min(1, "Birim seçiniz"),
  categoryId: z.string().optional(),
  taxRateId: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.string().optional(),
  salesPrice: z.string().optional(),
  minStockLevel: z.string().optional(),
  initialStock: z.string().optional(),
  warehouseId: z.string().optional(),
});

export type ProductForm = z.infer<typeof productSchema>;

export const PRODUCT_FORM_SERVER_FIELDS = [
  "code",
  "name",
  "unitId",
  "categoryId",
  "taxRateId",
  "barcode",
  "description",
  "purchasePrice",
  "salesPrice",
  "minStockLevel",
  "initialStock",
  "warehouseId",
] as const satisfies readonly (keyof ProductForm)[];

export const PRODUCT_FORM_DEFAULT_VALUES: Partial<ProductForm> = {
  purchasePrice: "0",
  salesPrice: "0",
  minStockLevel: "0",
};

export function toProductPayload(data: ProductForm): CreateProductDTO {
  return {
    code: data.code,
    name: data.name,
    unitId: data.unitId,
    categoryId: optionalText(data.categoryId),
    taxRateId: optionalText(data.taxRateId),
    barcode: optionalText(data.barcode),
    description: optionalText(data.description),
    purchasePrice: parseMoneyInput(data.purchasePrice),
    salesPrice: parseMoneyInput(data.salesPrice),
    minStockLevel: parseQuantityInput(data.minStockLevel),
  };
}

export function productToFormDefaults(product: Product): ProductForm {
  return {
    code: product.code,
    name: product.name,
    unitId: product.unitId,
    categoryId: product.categoryId ?? "",
    taxRateId: product.taxRateId ?? "",
    barcode: product.barcode ?? "",
    description: product.description ?? "",
    purchasePrice: String(product.purchasePrice),
    salesPrice: String(product.salesPrice),
    minStockLevel: String(product.minStockLevel),
    initialStock: "",
    warehouseId: "",
  };
}
