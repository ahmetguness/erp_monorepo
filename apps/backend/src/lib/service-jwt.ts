import jwt from 'jsonwebtoken';

/**
 * Service JWT — n8n gibi internal servisler için kısa ömürlü, scope'lu token.
 *
 * Kurallar:
 * - tenantId JWT payload'da → query/body'den ASLA alınmaz
 * - Ömür: 2 dakika (n8n tek bir request cycle'ı için yeterli)
 * - Scope: sadece izin verilen endpoint'ler
 */

const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET;
if (!SERVICE_JWT_SECRET) {
  throw new Error('SERVICE_JWT_SECRET ortam değişkeni tanımlı değil.');
}

export type ServiceScope =
  | 'read:invoices'
  | 'read:reports'
  | 'read:contacts'
  | 'read:stock'
  | 'read:products'
  | 'read:payments'
  | 'read:orders'
  | 'read:service'
  | 'read:hr'
  | 'read:production'
  | 'read:marketplace';

export interface ServiceJwtPayload {
  type: 'service';
  tenantId: string;
  userId: string;
  scopes: ServiceScope[];
  iat?: number;
  exp?: number;
}

/** Chatbot'un erişebileceği scope'lar — sadece okuma */
export const CHATBOT_SCOPES: ServiceScope[] = [
  'read:invoices',
  'read:reports',
  'read:contacts',
  'read:stock',
  'read:products',
  'read:payments',
  'read:orders',
  'read:service',
  'read:hr',
  'read:production',
  'read:marketplace',
];

/**
 * Belirli tenant + scope için kısa ömürlü service JWT üretir.
 * TTL: 2 dakika — tek bir n8n workflow cycle'ı için yeterli.
 */
export function generateServiceJwt(
  tenantId: string,
  userId: string,
  scopes: ServiceScope[],
): string {
  const payload: Omit<ServiceJwtPayload, 'iat' | 'exp'> = {
    type: 'service',
    tenantId,
    userId,
    scopes,
  };

  return jwt.sign(payload, SERVICE_JWT_SECRET, { expiresIn: '2m' });
}

/**
 * Service JWT doğrular ve payload döner.
 * Geçersizse null döner.
 */
export function verifyServiceJwt(token: string): ServiceJwtPayload | null {
  try {
    const payload = jwt.verify(token, SERVICE_JWT_SECRET) as ServiceJwtPayload;
    if (payload.type !== 'service') return null;
    return payload;
  } catch {
    return null;
  }
}
