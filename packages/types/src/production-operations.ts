export interface CreateWorkOrderCommand {
  productId: string;
  bomId?: string;
  plannedQty: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
  inputWarehouseId?: string;
  outputWarehouseId?: string;
}

export interface MaterialConsumptionCommand {
  itemId: string;
  quantity: number;
}

export interface RecordProductionOutputCommand {
  producedQty: number;
  scrapQty?: number;
  scrapReason?: string;
  operationId?: string;
  notes?: string;
  consumptions?: readonly MaterialConsumptionCommand[];
}

export interface CompleteWorkOrderCommand {
  notes?: string;
}
