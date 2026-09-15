import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

/**
 * Detect whether running inside Expo Go.
 * Remote push notifications (FCM/APNs) are unsupported in Expo Go since SDK 53.
 */
export function isExpoGo(): boolean {
  try {
    if (typeof isRunningInExpoGo === 'function' && isRunningInExpoGo()) {
      return true;
    }
  } catch {
    // fallback
  }
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as Record<string, unknown>).appOwnership === 'expo'
  );
}

// Set default notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export interface PushTokenResult {
  token: string | null;
  status: 'granted' | 'denied' | 'undetermined' | 'unsupported';
}

/**
 * Configure Android notification channels
 */
export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Varsayılan Bildirimler',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('critical', {
        name: 'Kritik Uyarılar ve Onaylar',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#ef4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (error) {
      console.warn('[Notifications] Failed to configure notification channels:', error);
    }
  }
}

/**
 * Request notification permissions and fetch Expo Push Token.
 * Gracefully handles Expo Go (SDK 53+ remote notification limitation).
 */
export async function registerForPushNotificationsAsync(): Promise<PushTokenResult> {
  if (Platform.OS === 'web') {
    return { token: null, status: 'unsupported' };
  }

  // Expo Go (SDK 53+) removed remote push notifications (FCM/APNs) support.
  // Calling getExpoPushTokenAsync in Expo Go triggers a fatal console.error on Android.
  // In development builds (dev-client) or standalone APK/AAB builds, push tokens work normally.
  if (isExpoGo()) {
    await configureNotificationChannels();
    return { token: null, status: 'unsupported' };
  }

  try {
    await configureNotificationChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return { token: null, status: 'denied' };
    }

    // Retrieve EAS projectId from config
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      'axon-erp-mobile';

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return { token: tokenResponse.data, status: 'granted' };
  } catch (error) {
    console.warn('[Notifications] Push notification registration skipped or failed:', error);
    return { token: null, status: 'undetermined' };
  }
}

/**
 * Update app icon badge count
 */
export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await Notifications.setBadgeCountAsync(Math.max(0, count));
    }
  } catch {
    // Non-critical, silently handle if unsupported on device
  }
}

/**
 * Add listener for notifications received while the app is in foreground
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for user interactions with notifications (taps)
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
