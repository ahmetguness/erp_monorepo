/**
 * Admin panelindeki tüm mutation hataları için merkezi hata çözümleyici.
 *
 * Hata akışı:
 *  backend → Axios → normalizeApiError (api-error.interceptor.ts) → { error: { code, message } }
 *
 * ADMIN_REAUTH_REQUIRED: admin-api-client.ts zaten /admin/sessions?reauth=1'e yönlendirir.
 * Diğer hata kodları için Türkçe, açıklayıcı mesajlar döndürür.
 */

import { toast, type ToastAction } from '@/store/ui.store';

interface NormalizedApiError {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    fields?: Record<string, string>;
  };
}

const REAUTH_CODES = new Set(['ADMIN_REAUTH_REQUIRED', 'UNAUTHORIZED']);

const CODE_MESSAGES: Record<string, string> = {
  ADMIN_REAUTH_REQUIRED:
    '🔐 Bu işlem için MFA (iki faktörlü) yeniden doğrulama gerekli.',
  UNAUTHORIZED:
    '🔐 Oturum süresi dolmuş veya yetki yok. Lütfen tekrar giriş yapın.',
  FORBIDDEN:
    '🚫 Bu işlem için yetkiniz bulunmuyor.',
  NOT_FOUND:
    '🔍 İlgili kayıt bulunamadı.',
  CONFLICT:
    '⚠️ Bu işlem çakışma nedeniyle tamamlanamadı. Veriler değişmiş olabilir, sayfayı yenileyip tekrar deneyin.',
  VALIDATION_ERROR:
    '📋 Girilen bilgiler geçersiz. Lütfen form alanlarını kontrol edin.',
  STATE_TRANSITION_ERROR:
    '🔄 Bu geçiş mevcut durum nedeniyle gerçekleştirilemiyor.',
  RATE_LIMITED:
    '⏳ Çok fazla istek gönderildi. Lütfen bir süre bekleyip tekrar deneyin.',
  NETWORK_ERROR:
    '🌐 Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.',
  INTERNAL_ERROR:
    '💥 Beklenmeyen bir sunucu hatası oluştu. Tekrar deneyin veya destek ekibiyle iletişime geçin.',
};

/**
 * Mutation onError callback'leri için kullanılacak merkezi fonksiyon.
 *
 * @param err - useMutation onError'dan gelen hata (zaten normalize edilmiş)
 * @param fallback - Hiçbir eşleşme yoksa gösterilecek varsayılan mesaj
 * @returns Kullanıcıya gösterilecek Türkçe hata mesajı
 */
export function extractAdminError(err: unknown, fallback = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'): string {
  const apiErr = err as NormalizedApiError | null | undefined;
  const code = apiErr?.error?.code;
  const message = apiErr?.error?.message;

  // Bilinen kod → özel mesaj
  if (code && CODE_MESSAGES[code]) {
    const base = CODE_MESSAGES[code];
    // Validation hatasında field bazlı detay ekle
    if (code === 'VALIDATION_ERROR' && apiErr?.error?.fields) {
      const fieldErrors = Object.entries(apiErr.error.fields)
        .map(([field, msg]) => `• ${field}: ${msg}`)
        .join('\n');
      return `${base}\n${fieldErrors}`;
    }
    // Reauth'ta sunucu mesajını yoksay
    if (REAUTH_CODES.has(code)) return base;
    // Sunucunun döndürdüğü özel mesaj varsa onu da ekle
    if (message && message !== base) return `${base}\n${message}`;
    return base;
  }

  // Bilinmeyen kod ama sunucu mesajı var
  if (message) return message;

  // Hiçbir bilgi yoksa fallback
  return fallback;
}

/**
 * Verilen hata ADMIN_REAUTH_REQUIRED mi?
 */
export function isReauthRequired(err: unknown): boolean {
  const code = (err as NormalizedApiError)?.error?.code;
  return code === 'ADMIN_REAUTH_REQUIRED';
}

export function isAdminErrorCode(err: unknown, code: string): boolean {
  return (err as NormalizedApiError | null | undefined)?.error?.code === code;
}

/**
 * Hata bildirimini toast olarak gösterir.
 * Eğer MFA gerekiyorsa otomatik olarak [MFA Doğrula →] eylem butonu ekler;
 * kullanıcı isteğe bağlı olarak bu butona tıklayarak oturumlar sayfasına gidebilir.
 */
export function toastAdminError(
  err: unknown,
  fallback = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  actionOverride?: ToastAction,
): void {
  const message = extractAdminError(err, fallback);
  if (isReauthRequired(err)) {
    toast.error(
      message,
      actionOverride ?? {
        label: 'MFA Doğrula →',
        href: '/admin/sessions?reauth=1',
      },
      10000,
    );
    return;
  }
  toast.error(message, actionOverride);
}
