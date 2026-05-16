import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || (process.env.NODE_ENV === 'production' ? undefined : process.env.JWT_SECRET);
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is required for credential encryption.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text: string): string {
  if (!text) return text;

  const iv = crypto.randomBytes(16);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!text) return text;

  if (!text.startsWith(PREFIX)) {
    return text;
  }

  const parts = text.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted credential payload is invalid.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
