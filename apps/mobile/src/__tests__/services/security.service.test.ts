import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkDeviceIntegrity,
  detectHookingFrameworks,
  isDeviceSecure,
  enforceDeviceSecurity,
} from '../../services/security.service';

describe('security.service Device Integrity & Threat Analysis', () => {
  beforeEach(() => {
    // Clean up any global injections
    const g = global as unknown as Record<string, unknown>;
    delete g.Frida;
    delete g.__fridaGlobal;
    delete g.frida;
  });

  it('should detect clean state when no hooks or root traces exist', async () => {
    const report = await checkDeviceIntegrity();

    expect(report.isHooked).toBe(false);
    expect(report.isRooted).toBe(false);
    expect(report.isJailbroken).toBe(false);
    expect(report.timestamp).toBeDefined();
  });

  it('should detect Frida framework when injected into global scope', () => {
    const g = global as unknown as Record<string, unknown>;
    g.Frida = { version: '16.1.4' };

    const result = detectHookingFrameworks();
    expect(result.isHooked).toBe(true);
    expect(result.threats).toContain('Frida dynamic instrumentation framework detected');
  });

  it('should flag device as compromised with CRITICAL threat level when hooked', async () => {
    const g = global as unknown as Record<string, unknown>;
    g.Frida = { version: '16.1.4' };

    const report = await checkDeviceIntegrity();
    expect(report.isHooked).toBe(true);
    expect(report.isCompromised).toBe(true);
    expect(report.threatLevel).toBe('CRITICAL');
  });

  it('isDeviceSecure should return false when device is compromised', async () => {
    const g = global as unknown as Record<string, unknown>;
    g.__fridaGlobal = true;

    const secure = await isDeviceSecure();
    expect(secure).toBe(false);
  });

  it('enforceDeviceSecurity should deny execution on compromised devices', async () => {
    const g = global as unknown as Record<string, unknown>;
    g.Frida = true;

    const result = await enforceDeviceSecurity();
    expect(result.allowed).toBe(false);
    expect(result.report.isCompromised).toBe(true);
  });
});
