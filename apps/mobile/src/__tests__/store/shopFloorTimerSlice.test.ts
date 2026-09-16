import { describe, it, expect } from 'vitest';
import shopFloorTimerReducer, {
  startTimer,
  tickTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  startDowntime,
  endDowntime,
  selectIsTimerRunning,
  selectIsDowntime,
  selectDowntimeReason,
  selectFormattedElapsedTime,
  selectFormattedDowntime,
  selectDowntimeLogs,
  ShopFloorTimerState,
} from '../../store/redux/shopFloorTimerSlice';

describe('shopFloorTimerSlice Reducer & Selectors (FAZ 16.2 Downtime)', () => {
  const getInitialState = (): ShopFloorTimerState => ({
    activeWorkOrderId: null,
    activeOperationId: null,
    workOrderNumber: null,
    productName: null,
    operationName: null,
    startTime: null,
    elapsedSeconds: 0,
    isRunning: false,
    isPaused: false,
    isDowntime: false,
    downtimeReason: null,
    downtimeNote: null,
    downtimeStartTime: null,
    downtimeSeconds: 0,
    totalDowntimeSeconds: 0,
    downtimeLogs: [],
  });

  it('should start timer with work order details', () => {
    const state = shopFloorTimerReducer(
      getInitialState(),
      startTimer({
        workOrderId: 'wo-1',
        workOrderNumber: 'WO-001',
        productName: 'Metal Mil',
      })
    );

    expect(state.isRunning).toBe(true);
    expect(state.isPaused).toBe(false);
    expect(state.activeWorkOrderId).toBe('wo-1');
    expect(state.workOrderNumber).toBe('WO-001');
    expect(state.isDowntime).toBe(false);
  });

  it('should tick elapsed seconds when running and not in downtime', () => {
    let state = shopFloorTimerReducer(
      getInitialState(),
      startTimer({ workOrderId: 'wo-1', workOrderNumber: 'WO-001' })
    );

    state = shopFloorTimerReducer(state, tickTimer());
    state = shopFloorTimerReducer(state, tickTimer());
    expect(state.elapsedSeconds).toBe(2);
    expect(state.downtimeSeconds).toBe(0);
  });

  it('should enter downtime mode, tick downtimeSeconds, and pause elapsed time progression', () => {
    let state = shopFloorTimerReducer(
      getInitialState(),
      startTimer({ workOrderId: 'wo-1', workOrderNumber: 'WO-001' })
    );

    state = shopFloorTimerReducer(state, tickTimer()); // elapsed: 1
    state = shopFloorTimerReducer(
      state,
      startDowntime({ reason: 'Mekanik Arıza', note: 'Rulman sıkıştı' })
    );

    expect(state.isDowntime).toBe(true);
    expect(state.downtimeReason).toBe('Mekanik Arıza');
    expect(state.downtimeNote).toBe('Rulman sıkıştı');

    // Tick 3 times during downtime
    state = shopFloorTimerReducer(state, tickTimer());
    state = shopFloorTimerReducer(state, tickTimer());
    state = shopFloorTimerReducer(state, tickTimer());

    // Elapsed should remain unchanged at 1, downtime should be 3
    expect(state.elapsedSeconds).toBe(1);
    expect(state.downtimeSeconds).toBe(3);
    expect(state.totalDowntimeSeconds).toBe(3);
  });

  it('should end downtime and record to downtimeLogs', () => {
    let state = shopFloorTimerReducer(
      getInitialState(),
      startTimer({ workOrderId: 'wo-1', workOrderNumber: 'WO-001' })
    );

    state = shopFloorTimerReducer(
      state,
      startDowntime({ reason: 'Elektrik Kesintisi', note: 'Pano arızası' })
    );
    state = shopFloorTimerReducer(state, tickTimer());
    state = shopFloorTimerReducer(state, tickTimer());

    state = shopFloorTimerReducer(state, endDowntime());

    expect(state.isDowntime).toBe(false);
    expect(state.downtimeReason).toBe(null);
    expect(state.downtimeSeconds).toBe(0);
    expect(state.downtimeLogs.length).toBe(1);
    expect(state.downtimeLogs[0]).toEqual({
      reason: 'Elektrik Kesintisi',
      durationSeconds: 2,
      note: 'Pano arızası',
    });

    // Following tick resumes normal elapsed progress
    state = shopFloorTimerReducer(state, tickTimer());
    expect(state.elapsedSeconds).toBe(1);
  });

  it('selectors should correctly format elapsed and downtime minutes', () => {
    const mockState = {
      shopFloorTimer: {
        ...getInitialState(),
        isRunning: true,
        isDowntime: true,
        downtimeReason: 'Kalıp Değişimi',
        elapsedSeconds: 3665, // 1h 1m 5s -> 01:01:05
        downtimeSeconds: 125, // 2m 5s -> 02:05
        downtimeLogs: [{ reason: 'Mekanik Arıza', durationSeconds: 60 }],
      },
    };

    expect(selectIsTimerRunning(mockState)).toBe(true);
    expect(selectIsDowntime(mockState)).toBe(true);
    expect(selectDowntimeReason(mockState)).toBe('Kalıp Değişimi');
    expect(selectFormattedElapsedTime(mockState)).toBe('01:01:05');
    expect(selectFormattedDowntime(mockState)).toBe('02:05');
    expect(selectDowntimeLogs(mockState).length).toBe(1);
  });
});
