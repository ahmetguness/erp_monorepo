import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
  hapticSuccessDoublePulse,
  hapticWarningTriplePulse,
  hapticBarcodeScan,
} from '../utils/haptics';

export function useHapticFeedback() {
  const impactLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const impactMedium = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const impactHeavy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  const impactRigid = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  }, []);

  const notifySuccess = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const notifyWarning = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const notifyError = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const selection = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const successDoublePulse = useCallback(() => {
    hapticSuccessDoublePulse().catch(() => {});
  }, []);

  const warningTriplePulse = useCallback(() => {
    hapticWarningTriplePulse().catch(() => {});
  }, []);

  const barcodeScan = useCallback(() => {
    hapticBarcodeScan().catch(() => {});
  }, []);

  return {
    impactLight,
    impactMedium,
    impactHeavy,
    impactRigid,
    notifySuccess,
    notifyWarning,
    notifyError,
    selection,
    successDoublePulse,
    warningTriplePulse,
    barcodeScan,
  };
}

