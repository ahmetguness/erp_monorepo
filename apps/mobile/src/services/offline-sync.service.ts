import { apiClient } from '../lib/api-client';
import { CreateSalesOrderDTO } from './sales.service';
import { CreateStockCountDTO, TransferStockDTO } from './inventory.service';
import { createFieldCheckpoint } from './field-service.service';
import { CreateLeaveRequestInput, createLeaveRequest } from './hr.service';

// ─────────────────────────────────────────────
// Mutation Types
// ─────────────────────────────────────────────

export type OutboxMutationType =
  | 'CREATE_SALES_ORDER'
  | 'SUBMIT_STOCK_COUNT'
  | 'CREATE_STOCK_MOVEMENT'
  | 'SUBMIT_FIELD_SERVICE_CHECKPOINT'
  | 'CREATE_LEAVE_REQUEST';

export interface FieldServiceCheckpointPayload {
  serviceRequestId: string;
  kind: 'SERVICE_FORM' | 'CUSTOMER_APPROVAL' | 'VISIT_NOTE';
  note?: string;
  customerName?: string;
}

export interface SyncResult {
  success: boolean;
  conflict?: boolean;
  networkError?: boolean;
  error?: string;
  responseData?: unknown;
}

// ─────────────────────────────────────────────
// Mutation Executor (10.4)
// ─────────────────────────────────────────────

/**
 * Executes a single outbox mutation with its idempotencyKey header.
 * Categorizes errors into network errors (retryable) vs. conflict/validation errors.
 */
export async function executeOutboxMutation(
  type: OutboxMutationType,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<SyncResult> {
  const headers = {
    'x-idempotency-key': idempotencyKey,
  };

  try {
    let responseData: unknown;

    switch (type) {
      case 'CREATE_SALES_ORDER': {
        const res = await apiClient.post(
          '/api/sales-orders',
          payload as unknown as CreateSalesOrderDTO,
          { headers },
        );
        responseData = res.data;
        break;
      }

      case 'SUBMIT_STOCK_COUNT': {
        const res = await apiClient.post(
          '/api/stock/counts',
          payload as unknown as CreateStockCountDTO,
          { headers },
        );
        responseData = res.data;
        break;
      }

      case 'CREATE_STOCK_MOVEMENT': {
        const res = await apiClient.post(
          '/api/warehouses/transfer',
          payload as unknown as TransferStockDTO,
          { headers },
        );
        responseData = res.data;
        break;
      }

      case 'SUBMIT_FIELD_SERVICE_CHECKPOINT': {
        const cp = payload as unknown as FieldServiceCheckpointPayload;
        const res = await createFieldCheckpoint(cp.serviceRequestId, cp.kind, {
          note: cp.note,
          customerName: cp.customerName,
        });
        responseData = res;
        break;
      }

      case 'CREATE_LEAVE_REQUEST': {
        const leaveInput = payload as unknown as CreateLeaveRequestInput;
        const res = await createLeaveRequest(leaveInput);
        responseData = res;
        break;
      }

      default:
        return {
          success: false,
          conflict: false,
          error: `Bilinmeyen mutasyon türü: ${type}`,
        };
    }

    return {
      success: true,
      responseData,
    };
  } catch (err: unknown) {
    const errorObj = err as {
      response?: { status: number; data?: { message?: string; error?: string } };
      message?: string;
      code?: string;
    };

    const status = errorObj.response?.status;
    const serverMessage =
      errorObj.response?.data?.message ||
      errorObj.response?.data?.error ||
      errorObj.message ||
      'Sunucu işlemi reddetti';

    // 409 Conflict or 400 with business conflict messages
    if (
      status === 409 ||
      (status === 400 &&
        (serverMessage.toLowerCase().includes('stok yetersiz') ||
          serverMessage.toLowerCase().includes('çakışma') ||
          serverMessage.toLowerCase().includes('conflict') ||
          serverMessage.toLowerCase().includes('zaten mevcut') ||
          serverMessage.toLowerCase().includes('limit aşıldı')))
    ) {
      return {
        success: false,
        conflict: true,
        networkError: false,
        error: serverMessage,
      };
    }

    // Network / Offline / Timeout error
    if (!status || errorObj.code === 'ECONNABORTED' || errorObj.message?.includes('Network Error')) {
      return {
        success: false,
        conflict: false,
        networkError: true,
        error: 'Ağ bağlantısı kurulamadı. İşlem kuyrukta bekletiliyor.',
      };
    }

    return {
      success: false,
      conflict: false,
      networkError: false,
      error: serverMessage,
    };
  }
}
