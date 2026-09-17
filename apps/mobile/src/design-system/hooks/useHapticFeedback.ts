// apps/mobile/src/design-system/hooks/useHapticFeedback.ts

import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

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

  return {
    impactLight,
    impactMedium,
    impactHeavy,
    impactRigid,
    notifySuccess,
    notifyWarning,
    notifyError,
    selection,
  };
}
