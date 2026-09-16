import { describe, it, expect } from 'vitest';
import reducer, {
  queueMutation,
  setMutationStatus,
  removeMutation,
  resolveConflict,
  clearAllMutations,
  setSyncingQueue,
  OfflineOutboxState,
} from '../../store/redux/offlineOutboxSlice';

describe('offlineOutboxSlice Reducer & State Machine', () => {
  const initialTestState: OfflineOutboxState = {
    mutations: [],
    isSyncingQueue: false,
    lastSyncCompletedAt: null,
    activeConflictMutationId: null,
  };

  it('should queue a new mutation with QUEUED status and default retry limit', () => {
    const payload = {
      type: 'CREATE_SALES_ORDER' as const,
      title: 'Test Satış Siparişi',
      payload: { customerId: 'cust_101', totalAmount: 4500 },
    };

    const nextState = reducer(initialTestState, queueMutation(payload));

    expect(nextState.mutations).toHaveLength(1);
    const item = nextState.mutations[0];
    expect(item.type).toBe('CREATE_SALES_ORDER');
    expect(item.status).toBe('QUEUED');
    expect(item.retryCount).toBe(0);
    expect(item.maxRetries).toBe(5);
    expect(item.idempotencyKey).toBeDefined();
    expect(item.id).toBeDefined();
  });

  it('should transition mutation status to SYNCING when syncing starts', () => {
    const stateWithItem: OfflineOutboxState = {
      ...initialTestState,
      mutations: [
        {
          id: 'mut_1',
          idempotencyKey: 'idem_1',
          type: 'CREATE_SALES_ORDER',
          title: 'Satış Siparişi',
          payload: { amount: 1200 },
          status: 'QUEUED',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    let nextState = reducer(stateWithItem, setSyncingQueue(true));
    nextState = reducer(
      nextState,
      setMutationStatus({ id: 'mut_1', status: 'SYNCING' })
    );
    expect(nextState.isSyncingQueue).toBe(true);
    expect(nextState.mutations[0].status).toBe('SYNCING');
  });

  it('should remove mutation upon success and update isSyncingQueue', () => {
    const stateWithItem: OfflineOutboxState = {
      ...initialTestState,
      isSyncingQueue: true,
      mutations: [
        {
          id: 'mut_1',
          idempotencyKey: 'idem_1',
          type: 'CREATE_SALES_ORDER',
          title: 'Satış Siparişi',
          payload: { amount: 1200 },
          status: 'SYNCING',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    let nextState = reducer(stateWithItem, removeMutation('mut_1'));
    nextState = reducer(nextState, setSyncingQueue(false));

    expect(nextState.mutations).toHaveLength(0);
    expect(nextState.isSyncingQueue).toBe(false);
  });

  it('should increment retryCount and set FAILED status on error', () => {
    const stateWithItem: OfflineOutboxState = {
      ...initialTestState,
      isSyncingQueue: true,
      mutations: [
        {
          id: 'mut_1',
          idempotencyKey: 'idem_1',
          type: 'CREATE_SALES_ORDER',
          title: 'Sipariş',
          payload: {},
          status: 'SYNCING',
          retryCount: 1,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const nextState = reducer(
      stateWithItem,
      setMutationStatus({
        id: 'mut_1',
        status: 'FAILED',
        lastError: 'Network timeout (504)',
        incrementRetry: true,
      })
    );

    expect(nextState.mutations[0].status).toBe('FAILED');
    expect(nextState.mutations[0].retryCount).toBe(2);
    expect(nextState.mutations[0].lastError).toBe('Network timeout (504)');
  });

  it('should resolve conflict by discard', () => {
    const stateWithConflict: OfflineOutboxState = {
      ...initialTestState,
      activeConflictMutationId: 'mut_conflict',
      mutations: [
        {
          id: 'mut_conflict',
          idempotencyKey: 'idem_c',
          type: 'SUBMIT_STOCK_COUNT',
          title: 'Sayım',
          payload: { count: 10 },
          status: 'RESOLVED_CONFLICT',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const nextState = reducer(
      stateWithConflict,
      resolveConflict({ id: 'mut_conflict', action: 'discard' })
    );

    expect(nextState.mutations).toHaveLength(0);
    expect(nextState.activeConflictMutationId).toBeNull();
  });

  it('should resolve conflict by retry with new idempotency key', () => {
    const stateWithConflict: OfflineOutboxState = {
      ...initialTestState,
      activeConflictMutationId: 'mut_conflict',
      mutations: [
        {
          id: 'mut_conflict',
          idempotencyKey: 'old_key',
          type: 'SUBMIT_STOCK_COUNT',
          title: 'Sayım',
          payload: { count: 10 },
          status: 'RESOLVED_CONFLICT',
          retryCount: 1,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const nextState = reducer(
      stateWithConflict,
      resolveConflict({ id: 'mut_conflict', action: 'retry' })
    );

    expect(nextState.mutations[0].status).toBe('QUEUED');
    expect(nextState.mutations[0].idempotencyKey).not.toBe('old_key');
    expect(nextState.activeConflictMutationId).toBeNull();
  });

  it('should clear entire outbox queue', () => {
    const populatedState: OfflineOutboxState = {
      ...initialTestState,
      mutations: [
        {
          id: '1',
          idempotencyKey: 'k1',
          type: 'CREATE_SALES_ORDER',
          title: 'S1',
          payload: {},
          status: 'QUEUED',
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const nextState = reducer(populatedState, clearAllMutations());
    expect(nextState.mutations).toHaveLength(0);
  });
});
