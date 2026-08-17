import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const ServiceAutomationResultSchema = z.object({
  serviceRequestId: z.string(),
  status: z.string(),
  invoiceId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  eDocumentCreated: z.boolean().optional(),
});

export type ServiceAutomationResult = z.infer<typeof ServiceAutomationResultSchema>;

export async function assignServiceTechnician(
  id: string,
  technicianId: string,
): Promise<{ serviceRequestId: string; assignedToId: string; status: string }> {
  const res = await apiClient.post(`/api/service/requests/${encodeURIComponent(id)}/automation/assign`, {
    technicianId,
  });
  return res.data.data;
}

export async function reserveServiceParts(
  id: string,
  warehouseId: string,
): Promise<{ serviceRequestId: string; reservedItemCount: number }> {
  const res = await apiClient.post(`/api/service/requests/${encodeURIComponent(id)}/automation/reserve-parts`, {
    warehouseId,
  });
  return res.data.data;
}

export async function completeServiceAndGenerateInvoice(
  id: string,
  warehouseId?: string,
): Promise<ServiceAutomationResult> {
  const res = await apiClient.post(`/api/service/requests/${encodeURIComponent(id)}/automation/complete-invoice`, {
    warehouseId,
  });
  return res.data.data;
}
