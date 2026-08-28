import { createHash, createHmac } from 'node:crypto';

export function hashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

export function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request');
}

export function amzDate(date: Date): { dateStamp: string; value: string } {
  const value = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { dateStamp: value.slice(0, 8), value };
}
