import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import * as Haptics from 'expo-haptics';
import { executeOutboxMutation } from '../../services/offline-sync.service';
import { setNetworkState, selectIsOnline } from './networkSlice';
import {
  queueMutation,
  resolveConflict,
  setMutationStatus,
  removeMutation,
  setSyncingQueue,
  OutboxMutation,
} from './offlineOutboxSlice';
import type { RootState, AppDispatch } from './store';

export const offlineListenerMiddleware = createListenerMiddleware();

let isProcessingQueue = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processOutboxQueue(dispatch: AppDispatch, getState: () => RootState) {
  if (isProcessingQueue) return;

  const state = getState();
  const isOnline = selectIsOnline(state);
  if (!isOnline) return;

  const queuedMutations = state.offlineOutbox.mutations.filter(
    (m: OutboxMutation) => m.status === 'QUEUED'
  );

  if (queuedMutations.length === 0) return;

  isProcessingQueue = true;
  dispatch(setSyncingQueue(true));

  try {
    for (const mutation of queuedMutations) {
      // Re-verify network status before each operation
      const currentState = getState();
      if (!selectIsOnline(currentState)) {
        break; // Stop loop if network dropped during processing
      }

      // 1. Mark as SYNCING
      dispatch(
        setMutationStatus({
          id: mutation.id,
          status: 'SYNCING',
        })
      );

      // 2. Execute via sync engine with idempotency key
      const result = await executeOutboxMutation(
        mutation.type,
        mutation.payload,
        mutation.idempotencyKey
      );

      if (result.success) {
        // 3a. Success: Remove from queue and notify
        dispatch(removeMutation(mutation.id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (result.conflict) {
        // 3b. Conflict: Move to RESOLVED_CONFLICT and ask user
        dispatch(
          setMutationStatus({
            id: mutation.id,
            status: 'RESOLVED_CONFLICT',
            lastError: result.error,
            conflictData: {
              clientPayload: mutation.payload,
              serverError: result.error,
              conflictReason: result.error || 'Veri çakışması tespit edildi',
            },
          })
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      } else if (result.networkError) {
        // 3c. Network error: Apply exponential backoff and keep in QUEUED
        const nextRetry = mutation.retryCount + 1;
        if (nextRetry < mutation.maxRetries) {
          const backoffMs = Math.min(30000, 1000 * Math.pow(2, mutation.retryCount));
          dispatch(
            setMutationStatus({
              id: mutation.id,
              status: 'QUEUED',
              incrementRetry: true,
              lastError: result.error,
            })
          );
          await delay(backoffMs);
        } else {
          // Max retries exceeded
          dispatch(
            setMutationStatus({
              id: mutation.id,
              status: 'FAILED',
              lastError: 'Maksimum yeniden deneme limitine ulaşıldı',
            })
          );
        }
        break; // Stop further mutations on network failure
      } else {
        // 3d. Other permanent error
        dispatch(
          setMutationStatus({
            id: mutation.id,
            status: 'FAILED',
            lastError: result.error || 'İşlem sunucu tarafından reddedildi',
          })
        );
      }
    }
  } catch (err: unknown) {
    console.warn('[OfflineListenerMiddleware] Unexpected error while processing queue:', err);
  } finally {
    isProcessingQueue = false;
    dispatch(setSyncingQueue(false));
  }
}

// ─────────────────────────────────────────────
// Listener Triggers (10.5)
// ─────────────────────────────────────────────

offlineListenerMiddleware.startListening({
  matcher: isAnyOf(setNetworkState, queueMutation, resolveConflict),
  effect: async (action, listenerApi) => {
    // Only process when network is online
    const state = listenerApi.getState() as RootState;
    if (selectIsOnline(state)) {
      await processOutboxQueue(
        listenerApi.dispatch as AppDispatch,
        listenerApi.getState as () => RootState
      );
    }
  },
});
