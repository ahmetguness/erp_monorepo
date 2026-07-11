import { apiClient } from '@/lib/api-client';

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

export const getHoldingCompany = () =>
  apiClient.get<{ data: HoldingCompanyResult }>('/api/enterprise/holding').then((response) => response.data.data);
