// ─────────────────────────────────────────────
// API WRAPPER TYPES
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    fields?: Record<string, string>;
  };
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export enum Plan {
  STARTER = "STARTER",
  PROFESSIONAL = "PROFESSIONAL",
  ENTERPRISE = "ENTERPRISE",
}

export enum TenantStatus {
  TRIAL = "TRIAL",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  CANCELLED = "CANCELLED",
}

export enum DeploymentType {
  CLOUD = "CLOUD",
  ON_PREMISE = "ON_PREMISE",
}

export enum ContactType {
  CUSTOMER = "CUSTOMER",
  SUPPLIER = "SUPPLIER",
  BOTH = "BOTH",
}

export enum MovementType {
  IN = "IN",
  OUT = "OUT",
  TRANSFER = "TRANSFER",
  ADJUSTMENT = "ADJUSTMENT",
  RETURN = "RETURN",
  OPENING = "OPENING",
}

export enum OrderStatus {
  DRAFT = "DRAFT",
  CONFIRMED = "CONFIRMED",
  PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

export enum QuoteStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum InvoiceType {
  SALES = "SALES",
  PURCHASE = "PURCHASE",
  RETURN_SALES = "RETURN_SALES",
  RETURN_PURCHASE = "RETURN_PURCHASE",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  PAID = "PAID",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
}

export enum PaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CREDIT_CARD = "CREDIT_CARD",
  CHECK = "CHECK",
  PROMISSORY_NOTE = "PROMISSORY_NOTE",
  OTHER = "OTHER",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum JournalEntryType {
  MANUAL = "MANUAL",
  AUTO_INVOICE = "AUTO_INVOICE",
  AUTO_PAYMENT = "AUTO_PAYMENT",
  AUTO_PAYROLL = "AUTO_PAYROLL",
  OPENING = "OPENING",
  CLOSING = "CLOSING",
}

export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE",
}

export enum FiscalPeriodStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
  LOCKED = "LOCKED",
}

export enum BankAccountType {
  CHECKING = "CHECKING",
  SAVINGS = "SAVINGS",
  CREDIT = "CREDIT",
  OTHER = "OTHER",
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  tenantMembership?: {
    isOwner: boolean;
    roleId: string | null;
    role: {
      id: string;
      name: string;
      isSystem: boolean;
      permissions: Array<{ module: string; action: string }>;
    } | null;
  };
}

export interface TenantInfo {
  id: string;
  slug: string;
  companyName: string;
  plan: Plan;
  status: TenantStatus;
  modules: string[];
  trialEndsAt?: string | null;
}

// ─────────────────────────────────────────────
// MASTER DATA
// ─────────────────────────────────────────────

export interface Unit {
  id: string;
  tenantId: string;
  name: string;
  code: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  children?: Category[];
}

export interface TaxRate {
  id: string;
  tenantId: string;
  name: string;
  rate: number;
  isActive: boolean;
}

export interface Currency {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  symbol: string;
  defaultRate: number;
  isBase: boolean;
}

// ─────────────────────────────────────────────
// CONTACT
// ─────────────────────────────────────────────

export interface Contact {
  id: string;
  tenantId: string;
  type: ContactType;
  name: string;
  code: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string;
  notes: string | null;
  creditLimit: number | null;
  paymentTermDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountEntry {
  id: string;
  tenantId: string;
  contactId: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
  description: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────
// PRODUCT & INVENTORY
// ─────────────────────────────────────────────

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  unitId: string;
  taxRateId: string | null;
  code: string;
  name: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  purchasePrice: number;
  salesPrice: number;
  minStockLevel: number;
  averageCost: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  unit?: Unit;
  taxRate?: TaxRate;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
  locations?: WarehouseLocation[];
}

export interface WarehouseLocation {
  id: string;
  warehouseId: string;
  tenantId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface StockLevel {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  quantity: number;
  updatedAt: string;
  product?: Pick<Product, 'id' | 'code' | 'name' | 'minStockLevel'> & {
    unit?: Pick<Unit, 'code'>;
  };
  warehouse?: Pick<Warehouse, 'id' | 'name' | 'code'>;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  unitCost: number | null;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  notes: string | null;
  createdAt: string;
  product?: Pick<Product, 'id' | 'code' | 'name'>;
  fromWarehouse?: Pick<Warehouse, 'id' | 'name'>;
  toWarehouse?: Pick<Warehouse, 'id' | 'name'>;
}

export interface StockCount {
  id: string;
  tenantId: string;
  warehouseId: string;
  number: string;
  date: string;
  isFinalized: boolean;
  finalizedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  warehouse?: Pick<Warehouse, 'id' | 'name'>;
  items?: StockCountItem[];
  _count?: { items: number };
}

export interface StockCountItem {
  id: string;
  tenantId: string;
  stockCountId: string;
  productId: string;
  locationId: string | null;
  expectedQty: number;
  countedQty: number;
  difference: number;
  product?: Pick<Product, 'id' | 'code' | 'name'>;
}

// ─────────────────────────────────────────────
// SALES
// ─────────────────────────────────────────────

export interface SalesQuote {
  id: string;
  tenantId: string;
  contactId: string;
  number: string;
  date: string;
  validUntil: string | null;
  status: QuoteStatus;
  notes: string | null;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
  contact?: Pick<Contact, 'id' | 'name'>;
  items?: SalesOrderItem[];
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  contactId: string;
  quoteId: string | null;
  number: string;
  date: string;
  dueDate: string | null;
  status: OrderStatus;
  notes: string | null;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  invoicedAmount: number;
  createdAt: string;
  updatedAt: string;
  contact?: Pick<Contact, 'id' | 'name'>;
  items?: SalesOrderItem[];
  invoices?: Pick<Invoice, 'id' | 'number' | 'status' | 'totalGross'>[];
}

export interface SalesOrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  productId: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
  product?: Pick<Product, 'id' | 'code' | 'name'>;
}

// ─────────────────────────────────────────────
// INVOICE
// ─────────────────────────────────────────────

export interface Invoice {
  id: string;
  tenantId: string;
  contactId: string;
  salesOrderId: string | null;
  purchaseOrderId: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  number: string;
  date: string;
  dueDate: string | null;
  currencyCode: string;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: Pick<Contact, 'id' | 'name' | 'taxNumber'>;
  lines?: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  productId: string | null;
  taxRateId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
  product?: Pick<Product, 'id' | 'code' | 'name'>;
  taxRate?: Pick<TaxRate, 'id' | 'name' | 'rate'>;
}

// ─────────────────────────────────────────────
// ACCOUNTING
// ─────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  accountType: AccountType;
  parentId: string | null;
  isActive: boolean;
  parent?: Pick<LedgerAccount, 'id' | 'code' | 'name'>;
  children?: Pick<LedgerAccount, 'id' | 'code' | 'name'>[];
}

export interface FiscalPeriod {
  id: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  fiscalPeriodId: string | null;
  type: JournalEntryType;
  number: string;
  date: string;
  description: string | null;
  isPosted: boolean;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: JournalEntryLine[];
  fiscalPeriod?: Pick<FiscalPeriod, 'id' | 'name' | 'status'>;
}

export interface JournalEntryLine {
  id: string;
  tenantId: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  sortOrder: number;
  account?: Pick<LedgerAccount, 'id' | 'code' | 'name'>;
}

// ─────────────────────────────────────────────
// PAYMENT
// ─────────────────────────────────────────────

export interface BankAccount {
  id: string;
  tenantId: string;
  name: string;
  accountNumber: string | null;
  iban: string | null;
  bankName: string | null;
  currencyCode: string;
  type: BankAccountType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashAccount {
  id: string;
  tenantId: string;
  name: string;
  currencyCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  contactId: string | null;
  bankAccountId: string | null;
  cashAccountId: string | null;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: Pick<Contact, 'id' | 'name'>;
  bankAccount?: Pick<BankAccount, 'id' | 'name'>;
  cashAccount?: Pick<CashAccount, 'id' | 'name'>;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  createdAt: string;
  invoice?: Pick<Invoice, 'id' | 'number' | 'totalGross'>;
}

// ─────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────

export interface RevenueSummary {
  period: { from: string; to: string };
  invoiceCount: number;
  totalNet: number;
  totalTax: number;
  totalGross: number;
}

export interface StockSummaryItem {
  productId: string;
  productCode: string;
  productName: string;
  warehouseName: string;
  quantity: number;
  minStockLevel: number;
}

export interface StockSummary {
  stockLevels: StockLevel[];
  summary: {
    totalLines: number;
    belowMinStockCount: number;
    totalStockValue: number;
  };
  belowMinStock: StockSummaryItem[];
}

export interface ContactBalanceItem {
  contactId: string;
  name: string;
  code: string | null;
  type: ContactType;
  balance: number;
  lastEntryDate: string | null;
}

export interface ContactBalanceSummary {
  contacts: ContactBalanceItem[];
  summary: {
    totalReceivable: number;
    totalPayable: number;
  };
}

export interface SavedReport {
  id: string;
  tenantId: string;
  name: string;
  module: string;
  filters: Record<string, unknown>;
  columns: string[];
  isShared: boolean;
  sharedRoleIds: string[];
  sharedUserIds: string[];
  columnTemplateName?: string | null;
  pinnedToDashboard: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export * from './plans';
