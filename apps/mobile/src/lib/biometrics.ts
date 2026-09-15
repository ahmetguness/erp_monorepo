import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricAuthType = 'FaceID' | 'TouchID' | 'Biometrics' | null;

export interface BiometricAvailability {
  available: boolean;
  enrolled: boolean;
  biometricType: BiometricAuthType;
  biometricTypeName: string;
}

export async function checkBiometricsAvailability(): Promise<BiometricAvailability> {
  try {
    if (Platform.OS === 'web') {
      return {
        available: false,
        enrolled: false,
        biometricType: null,
        biometricTypeName: 'Biyometrik',
      };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricAuthType = null;
    let biometricTypeName = 'Biyometrik';

    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'FaceID';
      biometricTypeName = Platform.OS === 'ios' ? 'Face ID' : 'Yüz Tanıma';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'TouchID';
      biometricTypeName = Platform.OS === 'ios' ? 'Touch ID' : 'Parmak İzi';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricType = 'Biometrics';
      biometricTypeName = 'İris Tanıma';
    }

    return {
      available: hasHardware && isEnrolled,
      enrolled: isEnrolled,
      biometricType,
      biometricTypeName,
    };
  } catch (error) {
    console.warn('[Biometrics] Availability check error:', error);
    return {
      available: false,
      enrolled: false,
      biometricType: null,
      biometricTypeName: 'Biyometrik',
    };
  }
}

export async function authenticateWithBiometrics(
  promptMessage = 'Giriş yapmak için kimliğinizi doğrulayın'
): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Şifre ile Giriş',
      cancelLabel: 'İptal',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch (error) {
    console.warn('[Biometrics] Auth error:', error);
    return false;
  }
}
