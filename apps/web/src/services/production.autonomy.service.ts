import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const WorkCenterCapacityItemSchema = z.object({
  workCenterId: z.string(),
  workCenterName: z.string(),
  code: z.string(),
  capacityHoursPerDay: z.number(),
  plannedWorkloadHours: z.number(),
  utilizationPct: z.number(),
  activeWorkOrdersCount: z.number(),
  status: z.enum(['NORMAL', 'HIGH_LOAD', 'BOTTLENECK']),
});

export const ScheduleOptimizationDetailSchema = z.object({
  workOrderId: z.string(),
  workOrderNumber: z.string(),
  productName: z.string(),
  oldStartDate: z.string(),
  newStartDate: z.string(),
  assignedWorkCenterName: z.string(),
});

export const ScheduleOptimizationResultSchema = z.object({
  totalWorkOrdersScanned: z.number(),
  rescheduledCount: z.number(),
  bottlenecksEliminated: z.number(),
  estimatedTimeSavedHours: z.number(),
  optimizedAt: z.string(),
  details: z.array(ScheduleOptimizationDetailSchema),
});

export const PredictiveMaintenanceItemSchema = z.object({
  workCenterId: z.string(),
  workCenterName: z.string(),
  operatingHours: z.number(),
  failureProbabilityPct: z.number(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  recommendedSpareParts: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      requiredQty: z.number(),
      isReserved: z.boolean(),
    }),
  ),
});

export type WorkCenterCapacityItem = z.infer<typeof WorkCenterCapacityItemSchema>;
export type ScheduleOptimizationResult = z.infer<typeof ScheduleOptimizationResultSchema>;
export type PredictiveMaintenanceItem = z.infer<typeof PredictiveMaintenanceItemSchema>;

export async function getWorkCenterCapacity(): Promise<WorkCenterCapacityItem[]> {
  const res = await apiClient.get('/api/production-autonomy/work-center-capacity');
  return res.data.data;
}

export async function runScheduleOptimization(autoReschedule = true): Promise<ScheduleOptimizationResult> {
  const res = await apiClient.post('/api/production-autonomy/optimize-schedule', { autoReschedule });
  return res.data.data;
}

export async function getPredictiveMaintenance(): Promise<PredictiveMaintenanceItem[]> {
  const res = await apiClient.get('/api/production-autonomy/predictive-maintenance');
  return res.data.data;
}

export async function reserveMaintenanceParts(
  workCenterId: string,
  productId: string,
  quantity: number,
): Promise<{ success: boolean; message: string; reservationId: string }> {
  const res = await apiClient.post('/api/production-autonomy/reserve-maintenance-parts', {
    workCenterId,
    productId,
    quantity,
  });
  return res.data.data;
}
