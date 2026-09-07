import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function encodeBase32(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let offset = 0; offset < bits.length; offset += 5) {
    output += ALPHABET[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = '';
  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(`admin-mfa:${secret}`).digest();
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function encryptTotpSecret(secret: string, encryptionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(encryptionSecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptTotpSecret(value: string, encryptionSecret: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted MFA secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(encryptionSecret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

function codeAt(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, submittedCode: string, now = Date.now()): boolean {
  return verifiedTotpCounter(secret, submittedCode, now) !== null;
}

export function verifiedTotpCounter(secret: string, submittedCode: string, now = Date.now()): number | null {
  if (!/^\d{6}$/u.test(submittedCode)) return null;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (const window of [0, -1, 1]) {
    const expected = Buffer.from(codeAt(secret, counter + window));
    const received = Buffer.from(submittedCode);
    if (expected.length === received.length && timingSafeEqual(expected, received)) return counter + window;
  }
  return null;
}

export function buildTotpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`Axon ERP Admin:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Axon ERP Admin')}&algorithm=SHA1&digits=6&period=30`;
}
