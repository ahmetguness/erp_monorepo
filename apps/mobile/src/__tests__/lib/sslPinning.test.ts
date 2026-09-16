import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import {
  SSL_PINNING_CONFIG,
  ANDROID_NETWORK_SECURITY_CONFIG_XML,
  IOS_ATS_PINNING_PLIST,
  attachSslAuditInterceptor,
} from '../../lib/sslPinning';

describe('sslPinning Security Configuration & Audit', () => {
  it('should have valid primary and backup SHA-256 SPKI pins for production domain', () => {
    expect(SSL_PINNING_CONFIG.domain).toBe('api.axon-erp.com');
    expect(SSL_PINNING_CONFIG.includeSubdomains).toBe(true);
    expect(SSL_PINNING_CONFIG.pins.primarySha256).toBeDefined();
    expect(SSL_PINNING_CONFIG.pins.backupSha256).toBeDefined();
    expect(SSL_PINNING_CONFIG.pins.primarySha256).not.toBe(SSL_PINNING_CONFIG.pins.backupSha256);
  });

  it('should format Android Network Security Config XML with correct pins and domain', () => {
    expect(ANDROID_NETWORK_SECURITY_CONFIG_XML).toContain('api.axon-erp.com');
    expect(ANDROID_NETWORK_SECURITY_CONFIG_XML).toContain(SSL_PINNING_CONFIG.pins.primarySha256);
    expect(ANDROID_NETWORK_SECURITY_CONFIG_XML).toContain(SSL_PINNING_CONFIG.pins.backupSha256);
    expect(ANDROID_NETWORK_SECURITY_CONFIG_XML).toContain('cleartextTrafficPermitted="false"');
  });

  it('should format iOS Info.plist ATS pinning configuration with SPKI-SHA256 tags', () => {
    expect(IOS_ATS_PINNING_PLIST).toContain('NSPinnedDomains');
    expect(IOS_ATS_PINNING_PLIST).toContain('api.axon-erp.com');
    expect(IOS_ATS_PINNING_PLIST).toContain(SSL_PINNING_CONFIG.pins.primarySha256);
    expect(IOS_ATS_PINNING_PLIST).toContain(SSL_PINNING_CONFIG.pins.backupSha256);
  });

  it('attachSslAuditInterceptor should block insecure HTTP URLs in production mode', async () => {
    const testAxios = axios.create();
    attachSslAuditInterceptor(testAxios);

    // Mock __DEV__ as false (production)
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

    await expect(
      testAxios.get('http://insecure-api.axon-erp.com/test', {
        baseURL: 'http://insecure-api.axon-erp.com',
      })
    ).rejects.toThrow(/Insecure cleartext HTTP request blocked in production/);

    // Reset __DEV__ to true for other tests
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  });
});
