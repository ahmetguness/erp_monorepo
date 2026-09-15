/**
 * Suppress Expo Go SDK 53+ notification limitation warnings **before**
 * expo-notifications is imported anywhere in the bundle.
 *
 * Both console.warn and console.error are patched at the entry point so that
 * expo-notifications' import-time warn (index.js) and any call-time error
 * (warnOfExpoGoPushUsage.ts) are silently swallowed in development/Expo Go.
 *
 * This file must be the very first import in App.tsx.
 */

const SUPPRESS_PATTERNS = [
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
];

const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function isSuppressed(msg: unknown): boolean {
  if (typeof msg !== 'string') return false;
  return SUPPRESS_PATTERNS.some((p) => msg.includes(p));
}

// eslint-disable-next-line no-console
console.error = (...args: unknown[]) => {
  if (isSuppressed(args[0])) return;
  _origError(...args);
};

// eslint-disable-next-line no-console
console.warn = (...args: unknown[]) => {
  if (isSuppressed(args[0])) return;
  _origWarn(...args);
};
