import { Resend } from 'resend';
import { logger } from './logger.js';

if (!process.env.RESEND_API_KEY) {
  logger.warn('[Mail] Provider is not configured; delivery is disabled', { operation: 'mail.configure', errorCode: 'PROVIDER_NOT_CONFIGURED' });
}

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Varsayılan gönderici adresi */
export const DEFAULT_FROM =
  process.env.RESEND_FROM_EMAIL || 'Axon ERP <noreply@axonerp.com>';
