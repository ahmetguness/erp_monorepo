import { InvoiceType, MovementType, Plan } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../errors';

type HoldingCompanyDbClient = PrismaClient;

export interface HoldingCompanyInput {
  tenantId: string;
}

export interface HoldingSummary {
  companyCount: number;
  branchCount: number;
  warehouseCount: number;
  consolidatedSales: number;
  consolidatedPurchases: number;
  consolidatedCollections: number;
  consolidatedStockValue: number;
  intercompanyTransferCount: number;
}

export interface HoldingCompanyNode {
  id: string;
  parentId: string | null;
  label: string;
  type: 'holding' | 'company' | 'branch';
  city: string | null;
  taxNumber: string | null;
  warehouseCount: number;
  stockValue: number;
}

export interface IntercompanyTransferRow {
  id: string;
  productCode: string;
  productName: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  createdAt: string;
  status: 'completed' | 'candidate';
}

export interface ConsolidatedReportRow {
  key: 'sales' | 'purchases' | 'collections' | 'stock';
  label: string;
  amount: number;
  recordCount: number;
}

export interface HoldingCompanyResult {
  generatedAt: string;
  summary: HoldingSummary;
  organization: HoldingCompanyNode[];
  intercompanyTransfers: IntercompanyTransferRow[];
  consolidatedReports: ConsolidatedReportRow[];
}

interface TenantLookup {
  id: string;
  companyName: string;
  taxNumber: string | null;
  city: string | null;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function warehouseBranchLabel(warehouse: { code: string; name: string }): string {
  return `${warehouse.code} - ${warehouse.name}`;
}

function rootNode(tenant: TenantLookup, warehouseCount: number, stockValue: number): HoldingCompanyNode {
  return {
    id: `holding:${tenant.id}`,
    parentId: null,
    label: tenant.companyName,
    type: 'holding',
    city: tenant.city,
    taxNumber: tenant.taxNumber,
    warehouseCount,
    stockValue,
  };
}

export async function getHoldingCompany(
  db: HoldingCompanyDbClient,
  input: HoldingCompanyInput,
): Promise<HoldingCompanyResult> {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, companyName: true, taxNumber: true, city: true, plan: true },
  });

  if (!tenant) throw new ValidationError('Tenant bulunamadi.');
  if (tenant.plan !== Plan.ENTERPRISE) {
    throw new ForbiddenError('Coklu sirket/sube paneli sadece Enterprise plan icindir.');
  }

  const [warehouses, invoiceGroups, paymentTotals, transfers, transferCount] = await Promise.all([
    db.warehouse.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        stockLevels: {
          select: {
            quantity: true,
            product: { select: { averageCost: true } },
          },
        },
      },
      orderBy: { code: 'asc' },
    }),
    db.invoice.groupBy({
      where: { tenantId: input.tenantId, deletedAt: null },
      by: ['type'],
      _sum: { totalGross: true },
      _count: { _all: true },
    }),
    db.payment.aggregate({
      where: { tenantId: input.tenantId, deletedAt: null, direction: 'RECEIVE' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.stockMovement.findMany({
      where: { tenantId: input.tenantId, type: MovementType.TRANSFER },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        product: { select: { code: true, name: true } },
        fromWarehouse: { select: { code: true, name: true } },
        toWarehouse: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.stockMovement.count({ where: { tenantId: input.tenantId, type: MovementType.TRANSFER } }),
  ]);

  const stockValueByWarehouse = new Map<string, number>();
  for (const warehouse of warehouses) {
    const value = warehouse.stockLevels.reduce((sum, level) => (
      sum + (decimalToNumber(level.quantity) * decimalToNumber(level.product.averageCost))
    ), 0);
    stockValueByWarehouse.set(warehouse.id, value);
  }

  const salesGroup = invoiceGroups.find((group) => group.type === InvoiceType.SALES);
  const purchaseGroup = invoiceGroups.find((group) => group.type === InvoiceType.PURCHASE);
  const consolidatedSales = decimalToNumber(salesGroup?._sum.totalGross);
  const consolidatedPurchases = decimalToNumber(purchaseGroup?._sum.totalGross);
  const consolidatedCollections = decimalToNumber(paymentTotals._sum.amount);
  const consolidatedStockValue = [...stockValueByWarehouse.values()].reduce((sum, value) => sum + value, 0);

  const holding = rootNode(tenant, warehouses.length, consolidatedStockValue);
  const companyNode: HoldingCompanyNode = {
    id: `company:${tenant.id}`,
    parentId: holding.id,
    label: `${tenant.companyName} Operasyon Sirketi`,
    type: 'company',
    city: tenant.city,
    taxNumber: tenant.taxNumber,
    warehouseCount: warehouses.length,
    stockValue: consolidatedStockValue,
  };
  const branchNodes = warehouses.map((warehouse): HoldingCompanyNode => ({
    id: `branch:${warehouse.id}`,
    parentId: companyNode.id,
    label: warehouseBranchLabel(warehouse),
    type: 'branch',
    city: warehouse.address ?? null,
    taxNumber: null,
    warehouseCount: 1,
    stockValue: stockValueByWarehouse.get(warehouse.id) ?? 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      companyCount: 1,
      branchCount: branchNodes.length,
      warehouseCount: warehouses.length,
      consolidatedSales,
      consolidatedPurchases,
      consolidatedCollections,
      consolidatedStockValue,
      intercompanyTransferCount: transferCount,
    },
    organization: [holding, companyNode, ...branchNodes],
    intercompanyTransfers: transfers.map((transfer): IntercompanyTransferRow => ({
      id: transfer.id,
      productCode: transfer.product.code,
      productName: transfer.product.name,
      fromBranch: transfer.fromWarehouse ? warehouseBranchLabel(transfer.fromWarehouse) : 'Kaynak yok',
      toBranch: transfer.toWarehouse ? warehouseBranchLabel(transfer.toWarehouse) : 'Hedef yok',
      quantity: decimalToNumber(transfer.quantity),
      createdAt: transfer.createdAt.toISOString(),
      status: 'completed',
    })),
    consolidatedReports: [
      { key: 'sales', label: 'Konsolide satis', amount: consolidatedSales, recordCount: salesGroup?._count._all ?? 0 },
      { key: 'purchases', label: 'Konsolide satin alma', amount: consolidatedPurchases, recordCount: purchaseGroup?._count._all ?? 0 },
      { key: 'collections', label: 'Konsolide tahsilat', amount: consolidatedCollections, recordCount: paymentTotals._count._all },
      { key: 'stock', label: 'Konsolide stok degeri', amount: consolidatedStockValue, recordCount: warehouses.length },
    ],
  };
}
