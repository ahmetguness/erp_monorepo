import { createHash, createHmac } from 'crypto';

const DEVELOPMENT_API_KEY_PEPPER = 'development-api-key-pepper';

function getApiKeyPepper(): string {
  return (
    process.env.API_KEY_PEPPER ??
    process.env.ENCRYPTION_KEY ??
    process.env.JWT_SECRET ??
    DEVELOPMENT_API_KEY_PEPPER
  );
}

export function createApiKeyHash(rawKey: string): string {
  return createHmac('sha256', getApiKeyPepper()).update(rawKey).digest('hex');
}

export function createLegacyApiKeyHash(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function isLegacyApiKeyHash(rawKey: string, storedHash: string): boolean {
  return storedHash === createLegacyApiKeyHash(rawKey);
}
