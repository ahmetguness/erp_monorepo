import type { StockLevelFilters, StockLevelReadRepository } from '../ports/stock-level-read.repository.js';

export class StockLevelQueries<TStockLevel extends object> {
  constructor(private readonly repository: StockLevelReadRepository<TStockLevel>) {}

  list(tenantId: string, filters: StockLevelFilters): Promise<TStockLevel[]> {
    return this.repository.list(tenantId, filters);
  }
}
