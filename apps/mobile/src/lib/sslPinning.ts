import { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface SslPinningConfig {
  domain: string;
  includeSubdomains: boolean;
  expirationDate: string;
  pins: {
    primarySha256: string;
    backupSha256: string;
  };
}

/**
 * Production SSL Pinning Configuration for AXON Enterprise ERP
 * Uses SHA-256 Subject Public Key Info (SPKI) hashes.
 */
export const SSL_PINNING_CONFIG: SslPinningConfig = {
  domain: 'api.axon-erp.com',
  includeSubdomains: true,
  expirationDate: '2027-12-31',
  pins: {
    // Primary Let's Encrypt / DigiCert Root CA SPKI hash
    primarySha256: 'k2v657xBsOVe1PQR/JU7tVu5prsHUfm+OJLESDZVUJA=',
    // Redundant Disaster Recovery SPKI hash
    backupSha256: 'WoiWRyIOVNa9ihaBciRSC7XHjliYS9VwUGOIud4PB18=',
  },
};

/**
 * Android Network Security Config template (for android/app/src/main/res/xml/network_security_config.xml)
 */
export const ANDROID_NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">api.axon-erp.com</domain>
    <pin-set expiration="2027-12-31">
      <pin digest="SHA-256">${SSL_PINNING_CONFIG.pins.primarySha256}</pin>
      <pin digest="SHA-256">${SSL_PINNING_CONFIG.pins.backupSha256}</pin>
    </pin-set>
  </domain-config>
</network-security-config>
`;

/**
 * iOS Info.plist NSPinnedDomains ATS template
 */
export const IOS_ATS_PINNING_PLIST = `
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSPinnedDomains</key>
  <dict>
    <key>api.axon-erp.com</key>
    <dict>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSPinnedLeafIdentities</key>
      <array>
        <dict>
          <key>SPKI-SHA256-BASE64</key>
          <string>${SSL_PINNING_CONFIG.pins.primarySha256}</string>
        </dict>
        <dict>
          <key>SPKI-SHA256-BASE64</key>
          <string>${SSL_PINNING_CONFIG.pins.backupSha256}</string>
        </dict>
      </array>
    </dict>
  </dict>
</dict>
`;

/**
 * Attaches SSL/TLS integrity auditing interceptor to Axios client
 */
export function attachSslAuditInterceptor(client: AxiosInstance): void {
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const isDebug = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false;
    // In production, enforce HTTPS strictly
    if (!isDebug && config.baseURL && !config.baseURL.startsWith('https://')) {
      const errorMsg = `[SSLAudit] Insecure cleartext HTTP request blocked in production: ${config.baseURL}`;
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
    return config;
  });
}
