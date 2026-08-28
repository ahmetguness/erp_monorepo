import { ValidationError } from '../../../../errors/index.js';

export function validateObjectKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) {
    throw new ValidationError('Geçersiz dosya anahtarı.');
  }
  return normalized;
}

export function encodeObjectKey(key: string): string {
  return validateObjectKey(key).split('/').map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}
