import crypto from 'crypto';
import { isIP } from 'node:net';
import { createApiKeyHash } from '../utils/api-key-hash.js';
import { isIpv4InCidr } from '../utils/request-ip.js';

export interface ApiKeyMaterial {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}

export interface IpAllowlistValidationResult {
  values: string[];
  invalidEntries: string[];
}

export function generateApiKeyMaterial(): ApiKeyMaterial {
  const rawKey = crypto.randomBytes(32).toString('hex');
  return {
    rawKey,
    keyHash: createApiKeyHash(rawKey),
    keyPrefix: rawKey.substring(0, 8),
  };
}

function normalizeIpValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  if (trimmed === '::1') return '127.0.0.1';
  return trimmed;
}

function isValidIpv4Cidr(value: string): boolean {
  const [range, prefixRaw] = value.split('/');
  if (!range || !prefixRaw || value.split('/').length !== 2) return false;
  if (isIP(range) !== 4) return false;

  const prefix = Number.parseInt(prefixRaw, 10);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

function isValidAllowlistEntry(value: string): boolean {
  return isIP(value) !== 0 || isValidIpv4Cidr(value);
}

export function validateIpAllowlist(entries: string[] | undefined): IpAllowlistValidationResult {
  const uniqueValues = new Set<string>();
  const invalidEntries: string[] = [];

  for (const entry of entries ?? []) {
    const normalized = normalizeIpValue(entry);
    if (!normalized) continue;

    if (isValidAllowlistEntry(normalized)) {
      uniqueValues.add(normalized);
    } else {
      invalidEntries.push(entry);
    }
  }

  return {
    values: Array.from(uniqueValues),
    invalidEntries,
  };
}

export function isIpAllowedByAllowlist(clientIp: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!clientIp) return false;

  const normalizedClientIp = normalizeIpValue(clientIp);
  return allowlist.some((entry) => {
    const normalizedEntry = normalizeIpValue(entry);
    if (normalizedEntry.includes('/')) {
      return isIpv4InCidr(normalizedClientIp, normalizedEntry);
    }
    return normalizedEntry === normalizedClientIp;
  });
}
