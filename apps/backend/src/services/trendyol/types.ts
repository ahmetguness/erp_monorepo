export interface TrendyolCredentials {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  /** Default: 'TR' */
  storeFrontCode?: string;
}

// ── Orders ────────────────────────────────────

export interface TrendyolAddress {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  cityCode: number;
  district: string;
  districtId: number;
  postalCode: string;
  countryCode: string;
  neighborhoodId: number;
  neighborhood: string;
  phone: string | null;
  fullAddress: string;
  fullName: string;
  taxOffice?: string;
  taxNumber?: string;
}

export interface TrendyolOrderLine {
  lineId: number;
  quantity: number;
  salesCampaignId: number;
  productSize: string;
  stockCode: string;
  productName: string;
  contentId: number;
  productOrigin: string;
  sellerId: number;
  lineGrossAmount: number;
  lineTotalDiscount: number;
  lineSellerDiscount: number;
  lineTyDiscount: number;
  discountDetails: Array<{ lineItemPrice: number; lineItemSellerDiscount: number; lineItemTyDiscount: number }>;
  currencyCode: string;
  productColor: string;
  vatRate: number;
  barcode: string;
  orderLineItemStatusName: string;
  lineUnitPrice: number;
  productCategoryId: number;
  commission: number;
  cancelledBy: string;
  cancelReason: string;
  cancelReasonCode: number;
}

export interface TrendyolOrder {
  shipmentPackageId: number;
  orderNumber: string;
  status: string;
  shipmentPackageStatus: string;
  orderDate: number;
  lastModifiedDate: number;
  activationDate: number;
  estimatedDeliveryStartDate: number;
  estimatedDeliveryEndDate: number;
  agreedDeliveryDate: number | null;
  originShipmentDate: number | null;
  packageGrossAmount: number;
  packageSellerDiscount: number;
  packageTyDiscount: number;
  packageTotalDiscount: number;
  packageTotalPrice: number;
  currencyCode: string;
  taxNumber: string | null;
  identityNumber: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerId: number;
  supplierId: number;
  shipmentAddress: TrendyolAddress;
  invoiceAddress: TrendyolAddress | null;
  lines: TrendyolOrderLine[];
  cargoTrackingNumber: number | null;
  cargoTrackingLink: string | null;
  cargoSenderNumber: string | null;
  cargoProviderName: string | null;
  deliveryType: string;
  deliveryAddressType: string;
  fastDelivery: boolean;
  fastDeliveryType: string | null;
  commercial: boolean;
  micro: boolean;
  isCod: boolean;
  warehouseId: number;
  invoiceLink: string | null;
  packageHistories: Array<{ createdDate: number; status: string }>;
  createdBy: 'order-creation' | 'cancel' | 'split' | 'transfer';
  originPackageIds: number[] | null;
  giftBoxRequested: boolean;
  containsDangerousProduct: boolean;
  cargoDeci: number;
  shipmentNumber: number;
}

export interface TrendyolOrdersResponse {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  content: TrendyolOrder[];
}

// ── Products (v2) ─────────────────────────────

export interface TrendyolVariant {
  variantId: number;
  supplierId: number;
  barcode: string;
  attributes: Array<{ attributeId: number; attributeName: string; attributeValueId?: number; attributeValue: string }>;
  productUrl: string;
  onSale: boolean;
  stock: { quantity?: number; lastModifiedDate: number | null };
  price: { salePrice: number; listPrice: number };
  stockCode: string;
  vatRate: number;
  sellerCreatedDate: number;
  sellerModifiedDate: number;
  locked: boolean;
  lockReason: string | null;
  archived: boolean;
  blacklisted: boolean;
}

export interface TrendyolProduct {
  contentId: number;
  productMainId: string;
  brand: { id: number; name: string };
  category: { id: number; name: string };
  creationDate: number;
  lastModifiedDate: number;
  title: string;
  description: string;
  images: Array<{ url: string }>;
  attributes: Array<{ attributeId: number; attributeName: string; attributeValueId?: number; attributeValue: string }>;
  variants: TrendyolVariant[];
}

export interface TrendyolProductsResponse {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  nextPageToken: string | null;
  content: TrendyolProduct[];
}

export interface TrendyolProductAttributeInput {
  attributeId: number;
  attributeValueId?: number;
  customAttributeValue?: string;
}

export interface TrendyolProductImageInput {
  url: string;
}

export interface TrendyolProductItemInput {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: 'TRY';
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images: TrendyolProductImageInput[];
  attributes: TrendyolProductAttributeInput[];
}

export interface TrendyolProductDeleteItem {
  barcode: string;
}

export interface TrendyolLookupOption {
  id: number;
  name: string;
}

export interface TrendyolCategoryAttributeValue extends TrendyolLookupOption {}

export interface TrendyolCategoryAttribute {
  id: number;
  name: string;
  required: boolean;
  allowCustom: boolean;
  values: TrendyolCategoryAttributeValue[];
}

export interface TrendyolCategoriesResponse {
  categories?: Array<{ id: number; name: string; subCategories?: TrendyolCategoriesResponse['categories'] }>;
}

export interface TrendyolBrandsResponse {
  brands?: Array<{ id: number; name: string }>;
}

export interface TrendyolCategoryAttributesResponse {
  categoryAttributes?: Array<{
    attribute: { id: number; name: string };
    required?: boolean;
    allowCustom?: boolean;
    attributeValues?: Array<{ id: number; name: string }>;
  }>;
}

export interface TrendyolCargoProvidersResponse {
  shipmentProviders?: Array<{ id?: number; code?: number | string; name: string }>;
  cargoCompanies?: Array<{ id?: number; code?: number | string; name: string }>;
}

// ── Stock & Price ─────────────────────────────

export interface TrendyolPriceInventoryItem {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
}

export interface TrendyolBatchResponse {
  batchRequestId: string;
}

export interface TrendyolBatchStatus {
  batchRequestId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  creationDate: number;
  lastModification: number;
  sourceType: string;
  itemCount: number;
  failedItemCount: number;
  items: Array<{ requestItem: Record<string, unknown>; status: string; failureReasons: string[] }>;
}

export interface BatchSummary {
  batchRequestId: string;
  status: TrendyolBatchStatus['status'];
  total: number;
  succeeded: number;
  failed: number;
  /** Per-status breakdown: { SUCCESS: 10, FAILED: 2, ... } */
  byStatus: Record<string, number>;
  failures: Array<{ barcode: string; status: string; reasons: string[] }>;
}

// ── Addresses ─────────────────────────────────

export interface TrendyolSupplierAddress {
  id: number;
  addressType: string;
  country: string;
  city: string;
  cityCode: number;
  district: string;
  districtId: number;
  postCode: string;
  address: string;
  neighborhoodId: number;
  neighborhood: string;
  floor: string;
  doorNumber: string;
  isDefault: boolean;
  fullAddress: string;
}

// ─────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────
