import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.warn('[Mail] RESEND_API_KEY tanımlı değil – mail gönderimi devre dışı.');
}

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Varsayılan gönderici adresi */
export const DEFAULT_FROM =
  process.env.RESEND_FROM_EMAIL || 'Axon ERP <noreply@axonerp.com>';
