import crypto from 'crypto';
import { activeEncryptionKeyId, activeEncryptionKeyMaterial, encryptionKeyMaterial } from './encryption-keyring.js';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

export function isEncryptedPayload(value: string): boolean {
  return value.startsWith(PREFIX) || value.startsWith('enc:v2:');
}

function getKey(id?: string): Buffer {
  return crypto.createHash('sha256').update(encryptionKeyMaterial(id)).digest();
}

export function encrypt(text: string): string {
  if (!text) return text;

  const iv = crypto.randomBytes(16);
  const keyId = activeEncryptionKeyId();
  // Unversioned v1 must use the same legacy material as its reader. The current
  // key may already be staged for a v2 rollout while that writer is disabled.
  const key = crypto.createHash('sha256').update(keyId ? activeEncryptionKeyMaterial() : encryptionKeyMaterial()).digest();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  if (keyId) cipher.setAAD(Buffer.from(`enc:v2:${keyId}`));

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${keyId ? `enc:v2:${keyId}:` : PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!text) return text;

  if (!isEncryptedPayload(text)) {
    return text;
  }

  const version2 = text.startsWith('enc:v2:');
  const encoded = version2 ? text.slice(7) : text.slice(PREFIX.length);
  const parts = encoded.split(':');
  const keyId = version2 ? parts.shift() : undefined;
  if (version2 && (!keyId || !/^[a-z][a-z0-9_-]{0,31}$/.test(keyId))) throw new Error('Encrypted credential payload is invalid.');
  if (parts.length !== 3) {
    throw new Error('Encrypted credential payload is invalid.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!/^[a-f0-9]{32}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(authTagHex) || !/^(?:[a-f0-9]{2})+$/i.test(encryptedHex) || encryptedHex.length > 2_097_152) throw new Error('Encrypted credential payload is invalid.');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey(keyId);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  if (keyId) decipher.setAAD(Buffer.from(`enc:v2:${keyId}`));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
