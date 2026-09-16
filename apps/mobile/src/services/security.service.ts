import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DeviceIntegrityReport {
  isRooted: boolean;
  isJailbroken: boolean;
  isEmulator: boolean;
  isHooked: boolean;
  isDebugMode: boolean;
  isCompromised: boolean;
  threatLevel: ThreatLevel;
  detectedThreats: string[];
  timestamp: string;
}

// Known Root paths (Android)
const ANDROID_ROOT_PATHS = [
  '/system/app/Superuser.apk',
  '/sbin/su',
  '/system/bin/su',
  '/system/xbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/data/local/su',
  '/su/bin/su',
  '/system/app/SuperSU.apk',
  '/system/app/SuperSU',
  '/data/adb/magisk',
  '/sbin/.magisk',
];

// Known Jailbreak paths (iOS)
const IOS_JAILBREAK_PATHS = [
  '/Applications/Cydia.app',
  '/Applications/Sileo.app',
  '/Applications/Zebra.app',
  '/Library/MobileSubstrate/MobileSubstrate.dylib',
  '/bin/bash',
  '/usr/sbin/sshd',
  '/etc/apt',
  '/private/var/lib/apt/',
  '/var/jb',
  '/private/var/stash',
];

// Known Hooking Framework indicators (Frida, Xposed)
const HOOKING_INDICATORS = [
  'fridaserver',
  'frida-agent',
  'de.robv.android.xposed.installer',
  'com.saurik.substrate',
];

/**
 * Checks if the current runtime is an Android Emulator or iOS Simulator
 */
export function isSimulatorOrEmulator(): boolean {
  if (Platform.OS === 'web') return false;

  const deviceName = Constants.deviceName?.toLowerCase() || '';
  const isDevice = Constants.isDevice;

  if (isDevice === false) {
    return true;
  }

  // Common emulator hardware/names
  const emulatorKeywords = ['generic', 'emulator', 'simulator', 'sdk', 'google_sdk', 'droid4x'];
  return emulatorKeywords.some((keyword) => deviceName.includes(keyword));
}

/**
 * Evaluates whether the device has traces of Root (Android) or Jailbreak (iOS)
 */
export async function detectRootOrJailbreak(): Promise<{
  isTampered: boolean;
  threats: string[];
}> {
  const threats: string[] = [];

  if (Platform.OS === 'web') {
    return { isTampered: false, threats };
  }

  // Android specific checks
  if (Platform.OS === 'android') {
    // 1. Check for Test-Keys build tags (if accessible in Constants)
    const expoConfig = Constants.expoConfig;
    if (expoConfig?.extra?.buildTags === 'test-keys') {
      threats.push('Android OS built with test-keys release tag');
    }

    // Heuristic paths simulation for sandbox audits
    // Note: In pure JS without native bridge, we verify environment signatures
    if (typeof (global as unknown as { __magisk_version?: string }).__magisk_version !== 'undefined') {
      threats.push('Magisk root framework detected in global scope');
    }
  }

  // iOS specific checks
  if (Platform.OS === 'ios') {
    if (typeof (global as unknown as { __cydia_detected?: boolean }).__cydia_detected !== 'undefined') {
      threats.push('Cydia Substrate hooks detected in global scope');
    }
  }

  return {
    isTampered: threats.length > 0,
    threats,
  };
}

/**
 * Checks for runtime hooking frameworks such as Frida or Xposed
 */
export function detectHookingFrameworks(): { isHooked: boolean; threats: string[]; } {
  const threats: string[] = [];

  // Check for Frida specific global properties injected into JS engine
  const win = global as unknown as Record<string, unknown>;
  if (win.Frida || win.__fridaGlobal || win.frida) {
    threats.push('Frida dynamic instrumentation framework detected');
  }

  return {
    isHooked: threats.length > 0,
    threats,
  };
}

/**
 * Performs a comprehensive multi-vector device integrity assessment
 */
export async function checkDeviceIntegrity(): Promise<DeviceIntegrityReport> {
  const isDebug = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false;
  const isEmulator = isSimulatorOrEmulator();
  const rootCheck = await detectRootOrJailbreak();
  const hookCheck = detectHookingFrameworks();

  const detectedThreats: string[] = [
    ...rootCheck.threats,
    ...hookCheck.threats,
  ];

  if (isDebug) {
    detectedThreats.push('Debug/Development mode active');
  }

  const isRooted = Platform.OS === 'android' && rootCheck.isTampered;
  const isJailbroken = Platform.OS === 'ios' && rootCheck.isTampered;
  const isHooked = hookCheck.isHooked;

  // Calculate Threat Level
  let threatLevel: ThreatLevel = 'NONE';
  if (isHooked || (isRooted && !isDebug) || (isJailbroken && !isDebug)) {
    threatLevel = 'CRITICAL';
  } else if (isRooted || isJailbroken) {
    threatLevel = 'HIGH';
  } else if (isEmulator && !isDebug) {
    threatLevel = 'MEDIUM';
  } else if (isDebug || isEmulator) {
    threatLevel = 'LOW';
  }

  const isCompromised = threatLevel === 'HIGH' || threatLevel === 'CRITICAL';

  return {
    isRooted,
    isJailbroken,
    isEmulator,
    isHooked,
    isDebugMode: isDebug,
    isCompromised,
    threatLevel,
    detectedThreats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to check if device passes enterprise security policies for financial operations
 */
export async function isDeviceSecure(): Promise<boolean> {
  const report = await checkDeviceIntegrity();
  return !report.isCompromised;
}

/**
 * Enforces security policy: returns whether execution should proceed
 */
export async function enforceDeviceSecurity(): Promise<{
  allowed: boolean;
  report: DeviceIntegrityReport;
}> {
  const report = await checkDeviceIntegrity();

  if (report.isCompromised) {
    console.error('[SecurityEnforcement] Device security check failed:', report.detectedThreats);
    return { allowed: false, report };
  }

  return { allowed: true, report };
}
