import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export interface ScreenCaptureProtectionOptions {
  /**
   * Whether protection is enabled. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Name of the protected screen for logging and audit traces.
   */
  screenName?: string;
  /**
   * Optional callback fired when a screenshot is attempted (iOS triggers notification).
   */
  onCaptureAttempt?: () => void;
}

export interface ScreenCaptureProtectionResult {
  isProtected: boolean;
  activateProtection: () => Promise<void>;
  deactivateProtection: () => Promise<void>;
  toggleProtection: () => Promise<void>;
}

/**
 * Enterprise hook to prevent screen captures and recordings on sensitive screens.
 * - Android: flags FLAG_SECURE on the window, rendering screenshots black and preventing screen recorders.
 * - iOS: prevents screenshots where supported and hides/blurs screen snapshot in App Switcher.
 */
export function useScreenCaptureProtection(
  options: ScreenCaptureProtectionOptions = {}
): ScreenCaptureProtectionResult {
  const { enabled = true, screenName = 'SensitiveScreen', onCaptureAttempt } = options;
  const [isProtected, setIsProtected] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const activateProtection = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await ScreenCapture.preventScreenCaptureAsync();
      if (isMountedRef.current) {
        setIsProtected(true);
      }
    } catch (err) {
      console.warn(`[ScreenCapture] Failed to prevent capture on ${screenName}:`, err);
    }
  }, [screenName]);

  const deactivateProtection = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await ScreenCapture.allowScreenCaptureAsync();
      if (isMountedRef.current) {
        setIsProtected(false);
      }
    } catch (err) {
      console.warn(`[ScreenCapture] Failed to allow capture after leaving ${screenName}:`, err);
    }
  }, [screenName]);

  const toggleProtection = useCallback(async () => {
    if (isProtected) {
      await deactivateProtection();
    } else {
      await activateProtection();
    }
  }, [isProtected, activateProtection, deactivateProtection]);

  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      activateProtection();
    }

    // Screenshot listener (works on iOS to detect screenshot attempts)
    let subscription: ScreenCapture.Subscription | null = null;
    try {
      subscription = ScreenCapture.addScreenshotListener(() => {
        if (onCaptureAttempt) {
          onCaptureAttempt();
        } else {
          console.warn(`[SecurityAudit] Screenshot attempted on protected screen: ${screenName}`);
        }
      });
    } catch {
      // Listener may not be supported on all architectures
    }

    return () => {
      isMountedRef.current = false;
      if (subscription) {
        subscription.remove();
      }
      if (enabled) {
        deactivateProtection();
      }
    };
  }, [enabled, activateProtection, deactivateProtection, screenName, onCaptureAttempt]);

  return {
    isProtected,
    activateProtection,
    deactivateProtection,
    toggleProtection,
  };
}
