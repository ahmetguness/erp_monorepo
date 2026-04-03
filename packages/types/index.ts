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

export enum UserRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  USER = "USER",
  VIEWER = "VIEWER",
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
}

export enum OrderStatus {
  DRAFT = "DRAFT",
  CONFIRMED = "CONFIRMED",
  PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED",
  DELIVERED = "DELIVERED",
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
  CANCELLED = "CANCELLED",
}

export enum EDocumentType {
  E_INVOICE = "E_INVOICE",
  E_ARCHIVE = "E_ARCHIVE",
  E_WAYBILL = "E_WAYBILL",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
}

export enum JournalEntryType {
  MANUAL = "MANUAL",
  AUTO_INVOICE = "AUTO_INVOICE",
  AUTO_PAYMENT = "AUTO_PAYMENT",
  AUTO_PAYROLL = "AUTO_PAYROLL",
  OPENING = "OPENING",
  CLOSING = "CLOSING",
}

export enum LeaveType {
  ANNUAL = "ANNUAL",
  SICK = "SICK",
  MATERNITY = "MATERNITY",
  PATERNITY = "PATERNITY",
  UNPAID = "UNPAID",
  OTHER = "OTHER",
}

export enum LeaveStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

export enum WorkOrderStatus {
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum ServiceStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_PARTS = "WAITING_PARTS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum MarketplaceChannel {
  TRENDYOL = "TRENDYOL",
  HEPSIBURADA = "HEPSIBURADA",
  N11 = "N11",
  AMAZON = "AMAZON",
  CICEKSEPETI = "CICEKSEPETI",
  OTHER = "OTHER",
}

export enum PurchaseRequestStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  ORDERED = "ORDERED",
}

export enum PurchaseOrderStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  RECEIVED = "RECEIVED",
  CANCELLED = "CANCELLED",
}

// ─────────────────────────────────────────────
// TENANT & AUTH
// ─────────────────────────────────────────────

export interface Tenant {
  id: string;
  createdAt: string;
  updatedAt: string;
  slug: string;
  companyName: string;
  taxNumber?: string;
  taxOffice?: string;
  email: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country: string;
  sector?: string;
  plan: Plan;
  status: TenantStatus;
  deploymentType: DeploymentType;
  maxUsers: number;
  trialEndsAt?: string;
  subscriptionStart?: string;
  subscriptionEnd?: string;
  modules: string[];
  notes?: string;
  users?: TenantUser[];
}

export interface User {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  name: string;
  phone?: string;
  isActive: boolean;
  tenants?: TenantUser[];
}

export interface AdminUser {
  id: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  name: string;
  isActive: boolean;
}

export interface TenantUser {
  id: string;
  createdAt: string;
  tenantId: string;
  userId: string;
  role: UserRole;
  tenant?: Tenant;
  user?: User;
}

// ─────────────────────────────────────────────
// ÇEKIRDEK (SHARED)
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
  parentId?: string;
  parent?: Category;
  children?: Category[];
}

export interface TaxRate {
  id: string;
  tenantId: string;
  name: string;
  rate: number;
}

export interface Currency {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isBase: boolean;
}

// ─────────────────────────────────────────────
// CARİ HESAP
// ─────────────────────────────────────────────

export interface Contact {
  id: string;
  tenantId: string;
  type: ContactType;
  name: string;
  code?: string;
  taxNumber?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country: string;
  notes?: string;
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
  description?: string;
  refType?: string;
  refId?: string;
  createdAt: string;
  contact?: Contact;
}

// ─────────────────────────────────────────────
// ÜRÜN
// ─────────────────────────────────────────────

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string;
  unitId: string;
  taxRateId?: string;
  code: string;
  name: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  purchasePrice: number;
  salesPrice: number;
  minStockLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  unit?: Unit;
  taxRate?: TaxRate;
}

// ─────────────────────────────────────────────
// DEPO YÖNETİMİ
// ─────────────────────────────────────────────

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address?: string;
  isActive: boolean;
  locations?: Location[];
}

export interface Location {
  id: string;
  warehouseId: string;
  name: string;
  code: string;
  warehouse?: Warehouse;
}

export interface StockLevel {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  locationId?: string;
  quantity: number;
  reservedQty: number;
  updatedAt: string;
  product?: Product;
  warehouse?: Warehouse;
  location?: Location;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  unitCost?: number;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  refType?: string;
  refId?: string;
  notes?: string;
  createdAt: string;
  createdById?: string;
  product?: Product;
  fromWarehouse?: Warehouse;
  toWarehouse?: Warehouse;
}

export interface StockCount {
  id: string;
  tenantId: string;
  warehouseId: string;
  number: string;
  date: string;
  isFinalized: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  warehouse?: Warehouse;
  items?: StockCountItem[];
}

export interface StockCountItem {
  id: string;
  stockCountId: string;
  productId: string;
  locationId?: string;
  expectedQty: number;
  countedQty: number;
  difference: number;
  product?: Product;
}

// ─────────────────────────────────────────────
// SATIŞ & TEKLİF
// ─────────────────────────────────────────────

export interface SalesQuote {
  id: string;
  tenantId: string;
  contactId: string;
  number: string;
  date: string;
  validUntil?: string;
  status: OrderStatus;
  notes?: string;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  items?: SalesQuoteItem[];
}

export interface SalesQuoteItem {
  id: string;
  quoteId: string;
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  product?: Product;
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  contactId: string;
  number: string;
  date: string;
  dueDate?: string;
  status: OrderStatus;
  notes?: string;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  items?: SalesOrderItem[];
  invoices?: Invoice[];
}

export interface SalesOrderItem {
  id: string;
  orderId: string;
  productId: string;
  description?: string;
  quantity: number;
  delivered: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  product?: Product;
}

// ─────────────────────────────────────────────
// SATIN ALMA
// ─────────────────────────────────────────────

export interface PurchaseRequest {
  id: string;
  tenantId: string;
  number: string;
  date: string;
  status: PurchaseRequestStatus;
  requestedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseRequestItem[];
}

export interface PurchaseRequestItem {
  id: string;
  requestId: string;
  productId: string;
  description?: string;
  quantity: number;
  notes?: string;
  product?: Product;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  contactId: string;
  number: string;
  date: string;
  dueDate?: string;
  status: PurchaseOrderStatus;
  notes?: string;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  items?: PurchaseOrderItem[];
  invoices?: Invoice[];
}

export interface PurchaseOrderItem {
  id: string;
  orderId: string;
  productId: string;
  description?: string;
  quantity: number;
  received: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  product?: Product;
}

// ─────────────────────────────────────────────
// FATURA YÖNETİMİ
// ─────────────────────────────────────────────

export interface Invoice {
  id: string;
  tenantId: string;
  contactId: string;
  salesOrderId?: string;
  purchaseOrderId?: string;
  type: InvoiceType;
  status: InvoiceStatus;
  number: string;
  date: string;
  dueDate?: string;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  paidAmount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  lines?: InvoiceLine[];
  eDocuments?: EDocument[];
  payments?: Payment[];
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  productId?: string;
  taxRateId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
  product?: Product;
  taxRate?: TaxRate;
}

export interface EDocument {
  id: string;
  invoiceId: string;
  type: EDocumentType;
  uuid?: string;
  status?: string;
  sentAt?: string;
  responseAt?: string;
  rawResponse?: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference?: string;
  status: PaymentStatus;
  notes?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// MUHASEBE
// ─────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  parentId?: string;
  isActive: boolean;
  parent?: LedgerAccount;
  children?: LedgerAccount[];
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  type: JournalEntryType;
  number: string;
  date: string;
  description?: string;
  refType?: string;
  refId?: string;
  isPosted: boolean;
  createdAt: string;
  updatedAt: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  account?: LedgerAccount;
}

// ─────────────────────────────────────────────
// PERSONEL TAKİBİ
// ─────────────────────────────────────────────

export interface Employee {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  hireDate: string;
  leaveDate?: string;
  salary: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  leaveRequests?: LeaveRequest[];
  attendances?: Attendance[];
  payrolls?: Payroll[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  employee?: Employee;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  overtimeHours: number;
  notes?: string;
  employee?: Employee;
}

export interface Payroll {
  id: string;
  tenantId: string;
  employeeId: string;
  period: string;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  employee?: Employee;
  items?: PayrollItem[];
}

export interface PayrollItem {
  id: string;
  payrollId: string;
  label: string;
  amount: number;
  isDeduction: boolean;
}

// ─────────────────────────────────────────────
// ÜRETİM TAKİBİ
// ─────────────────────────────────────────────

export interface BOM {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  product?: Product;
  items?: BOMItem[];
}

export interface BOMItem {
  id: string;
  bomId: string;
  productId: string;
  quantity: number;
  unit?: string;
  notes?: string;
  product?: Product;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  bomId?: string;
  productId: string;
  number: string;
  status: WorkOrderStatus;
  plannedQty: number;
  producedQty: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  product?: Product;
  items?: WorkOrderItem[];
}

export interface WorkOrderItem {
  id: string;
  workOrderId: string;
  productId: string;
  requiredQty: number;
  consumedQty: number;
  product?: Product;
}

// ─────────────────────────────────────────────
// TEKNİK SERVİS
// ─────────────────────────────────────────────

export interface ServiceRequest {
  id: string;
  tenantId: string;
  contactId?: string;
  number: string;
  status: ServiceStatus;
  subject: string;
  description?: string;
  deviceInfo?: string;
  serialNo?: string;
  warrantyEnd?: string;
  assignedTo?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
  items?: ServiceRequestItem[];
}

export interface ServiceRequestItem {
  id: string;
  serviceRequestId: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product?: Product;
}

// ─────────────────────────────────────────────
// E-TİCARET
// ─────────────────────────────────────────────

export interface MarketplaceIntegration {
  id: string;
  tenantId: string;
  channel: MarketplaceChannel;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  listings?: MarketplaceListing[];
  orders?: MarketplaceOrder[];
}

export interface MarketplaceListing {
  id: string;
  integrationId: string;
  productId: string;
  externalId: string;
  externalSku?: string;
  price: number;
  stock: number;
  isActive: boolean;
  lastSyncAt?: string;
  product?: Product;
  integration?: MarketplaceIntegration;
}

export interface MarketplaceOrder {
  id: string;
  integrationId: string;
  externalId: string;
  channel: MarketplaceChannel;
  status: string;
  customerName?: string;
  customerEmail?: string;
  totalAmount: number;
  orderDate: string;
  syncedAt: string;
  integration?: MarketplaceIntegration;
  items?: MarketplaceOrderItem[];
}

export interface MarketplaceOrderItem {
  id: string;
  marketplaceOrderId: string;
  externalProductId: string;
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// ─────────────────────────────────────────────
// RAPORLAMA
// ─────────────────────────────────────────────

export interface SavedReport {
  id: string;
  tenantId: string;
  name: string;
  module: string;
  filters: Record<string, unknown>;
  columns: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}
