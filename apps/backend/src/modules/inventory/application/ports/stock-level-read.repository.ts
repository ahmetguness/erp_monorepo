export interface StockLevelFilters {
  warehouseId?: string;
  productId?: string;
  locationId?: string;
  belowMinimum?: boolean;
}

export interface StockLevelReadRepository<TStockLevel extends object> {
  list(tenantId: string, filters: StockLevelFilters): Promise<TStockLevel[]>;
}
