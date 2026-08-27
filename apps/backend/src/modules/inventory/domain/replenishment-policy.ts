export type SuggestionPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SalesVelocity {
  daily30: number;
  daily60: number;
  daily90: number;
  trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
}

export function determineSalesVelocityTrend(daily30: number, daily60: number, daily90: number): SalesVelocity['trend'] {
  if (daily30 === 0 && daily60 === 0 && daily90 === 0) return 'STABLE';
  const older = daily90 > 0 ? daily90 : daily60;
  if (older === 0) return daily30 > 0 ? 'ACCELERATING' : 'STABLE';
  const ratio = daily30 / older;
  if (ratio > 1.15) return 'ACCELERATING';
  if (ratio < 0.85) return 'DECELERATING';
  return 'STABLE';
}

export function determineSuggestionPriority(
  available: number,
  minStockLevel: number,
  estimatedDaysToStockout: number | null,
  reservationRatio: number,
): SuggestionPriority {
  if (available <= 0) return 'CRITICAL';
  if (estimatedDaysToStockout !== null && estimatedDaysToStockout <= 3) return 'CRITICAL';
  if (estimatedDaysToStockout !== null && estimatedDaysToStockout <= 7) return 'HIGH';
  if (available < minStockLevel * 0.5 || reservationRatio > 0.7) return 'HIGH';
  if (available < minStockLevel) return 'MEDIUM';
  return 'LOW';
}
