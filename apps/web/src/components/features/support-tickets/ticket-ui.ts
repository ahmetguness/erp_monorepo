import type { BadgeVariant } from '@/components/ui/Badge';
import type {
  PlatformTicketCategory,
  PlatformTicketPriority,
  PlatformTicketStatus,
} from '@repo/types';

export const CATEGORY_LABELS: Record<PlatformTicketCategory, string> = {
  TECHNICAL: 'Teknik Sorun',
  BILLING: 'Fatura & Abonelik',
  ACCOUNT: 'Hesap & Yetki',
  FEATURE_REQUEST: 'Özellik Talebi',
  OTHER: 'Genel Destek',
};

export const CATEGORY_DESCRIPTIONS: Record<PlatformTicketCategory, string> = {
  TECHNICAL: 'Hata kodları, sistem erişimi veya entegrasyon aksaklıkları',
  BILLING: 'Ödeme, faturalar, plan yükseltme ve abonelik soruları',
  ACCOUNT: 'Kullanıcı davetleri, roller, 2FA veya profil ayarları',
  FEATURE_REQUEST: 'İşletmenizin ihtiyaç duyduğu yeni özellik veya geliştirmeler',
  OTHER: 'Diğer tüm genel danışma ve rehberlik konuları',
};

export const STATUS_CONFIG: Record<
  PlatformTicketStatus,
  {
    label: string;
    variant: BadgeVariant;
    dotClass: string;
    badgeClass: string;
    description: string;
  }
> = {
  OPEN: {
    label: 'Açık (Yeni)',
    variant: 'info',
    dotClass: 'bg-sky-400 animate-pulse',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    description: 'Talep destek ekibinin inceleme kuyruğunda.',
  },
  IN_PROGRESS: {
    label: 'İnceleniyor',
    variant: 'warning',
    dotClass: 'bg-amber-400',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    description: 'Destek uzmanı talebinizi aktif olarak inceliyor.',
  },
  WAITING_TENANT: {
    label: 'Yanıtınız Bekleniyor',
    variant: 'danger',
    dotClass: 'bg-rose-400 animate-pulse',
    badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    description: 'Destek uzmanımız sizden ek bilgi veya teyit bekliyor.',
  },
  RESOLVED: {
    label: 'Çözüldü',
    variant: 'success',
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    description: 'Sorun çözüldü veya talep karşılandı.',
  },
  CLOSED: {
    label: 'Kapatıldı',
    variant: 'neutral',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-600/30 bg-slate-700/20 text-slate-400',
    description: 'Talep arşivlendi ve iletişime kapatıldı.',
  },
};

export const PRIORITY_CONFIG: Record<
  PlatformTicketPriority,
  {
    label: string;
    variant: BadgeVariant;
    borderColor: string;
    textColor: string;
    dotColor: string;
    bgSoft: string;
  }
> = {
  LOW: {
    label: 'Düşük',
    variant: 'neutral',
    borderColor: 'border-slate-700',
    textColor: 'text-slate-400',
    dotColor: 'bg-slate-400',
    bgSoft: 'bg-slate-800/40',
  },
  MEDIUM: {
    label: 'Orta',
    variant: 'info',
    borderColor: 'border-sky-800/60',
    textColor: 'text-sky-400',
    dotColor: 'bg-sky-400',
    bgSoft: 'bg-sky-950/20',
  },
  HIGH: {
    label: 'Yüksek',
    variant: 'warning',
    borderColor: 'border-amber-800/60',
    textColor: 'text-amber-400',
    dotColor: 'bg-amber-400',
    bgSoft: 'bg-amber-950/20',
  },
  URGENT: {
    label: 'Acil',
    variant: 'danger',
    borderColor: 'border-rose-700',
    textColor: 'text-rose-400',
    dotColor: 'bg-rose-500 animate-ping',
    bgSoft: 'bg-rose-950/30',
  },
};

export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Az önce';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} dk önce`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} saat önce`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays} gün önce`;
  
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatClockTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function formatChatDateHeader(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return 'Bugün';
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function isReauthRequired(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (obj.error && typeof obj.error === 'object') {
      const errObj = obj.error as { code?: string };
      if (errObj.code === 'ADMIN_REAUTH_REQUIRED') return true;
    }
    if ('response' in obj && obj.response && typeof obj.response === 'object') {
      const res = obj.response as { data?: { code?: string; error?: string | { code?: string } } };
      const dataCode = res.data?.code || (typeof res.data?.error === 'object' ? res.data?.error?.code : undefined);
      if (dataCode === 'ADMIN_REAUTH_REQUIRED') return true;
    }
  }
  return false;
}

export function getErrorMessage(error: unknown, fallback = 'Bir hata oluştu.'): string {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    // 1. Normalized API Error: { error: { code, message, ... } }
    if (obj.error && typeof obj.error === 'object') {
      const errObj = obj.error as { code?: string; message?: string };
      if (errObj.code === 'ADMIN_REAUTH_REQUIRED') {
        return 'Kritik İşlem Doğrulaması Gerekli: Oturum süreniz dolmuş olabilir. Lütfen /admin/sessions sayfasından MFA ile yeniden doğrulama yapın.';
      }
      if (errObj.code === 'FORBIDDEN') {
        return errObj.message || 'Bu işlem için yetkiniz bulunmuyor (support-ticket.manage izni gereklidir).';
      }
      if (errObj.code === 'UNAUTHORIZED') {
        return 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.';
      }
      if (typeof errObj.message === 'string' && errObj.message.trim()) {
        return errObj.message;
      }
    }

    // 2. Direct string error: { error: "Mesaj" }
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return obj.error;
    }

    // 3. Direct message property: { message: "Mesaj" }
    if (typeof obj.message === 'string' && obj.message.trim() && !(error instanceof Error)) {
      return obj.message;
    }

    // 4. Raw Axios Error: { response: { status, data: ... } }
    if ('response' in obj && obj.response && typeof obj.response === 'object') {
      const axiosErr = obj as {
        response?: {
          status?: number;
          data?: {
            error?: string | { code?: string; message?: string };
            message?: string;
            code?: string;
          };
        };
      };

      const resData = axiosErr.response?.data;
      const status = axiosErr.response?.status;

      const code =
        resData?.code ||
        (typeof resData?.error === 'object' ? resData?.error?.code : undefined);

      if (code === 'ADMIN_REAUTH_REQUIRED') {
        return 'Kritik İşlem Doğrulaması Gerekli: Oturum süreniz dolmuş olabilir. Lütfen /admin/sessions sayfasından MFA ile yeniden doğrulama yapın.';
      }

      if (code === 'FORBIDDEN' || status === 403) {
        if (typeof resData?.error === 'string') return resData.error;
        if (typeof resData?.error === 'object' && resData.error?.message) return resData.error.message;
        return 'Bu işlem için yetkiniz bulunmuyor (support-ticket.manage izni gereklidir).';
      }

      if (status === 401) {
        return 'Oturum süreniz dolmuş. Lütfen sayfayı yenileyip tekrar giriş yapın.';
      }

      if (resData?.error) {
        if (typeof resData.error === 'string') return resData.error;
        if (typeof resData.error === 'object' && typeof resData.error.message === 'string') {
          return resData.error.message;
        }
      }

      if (typeof resData?.message === 'string') {
        return resData.message;
      }
    }
  }

  if (error instanceof Error) return error.message;
  return fallback;
}

export const CANNED_RESPONSES = [
  {
    title: 'İnceleme Başlatıldı',
    text: 'Merhaba, bildiriminiz için teşekkürler. İlettiğiniz konuyu teknik ekibimizle birlikte detaylı olarak inceliyoruz. En kısa sürede geri dönüş sağlayacağız.',
  },
  {
    title: 'Ek Bilgi & Ekran Görüntüsü',
    text: 'Merhaba, sorununuzu daha hızlı teşhis edebilmemiz için hatayı aldığınız ekran görüntüsünü veya ilgili işlem adımlarını paylaşabilir misiniz?',
  },
  {
    title: 'Sorun Çözüldü',
    text: 'Merhaba, gerekli kontroller ve düzenlemeler yapılmıştır. Lütfen işleminizi tekrar deneyerek sonucu bizimle paylaşabilir misiniz?',
  },
  {
    title: 'Geliştirme Planına Alındı',
    text: 'Merhaba, değerli geri bildiriminiz için teşekkür ederiz. Öneriniz ürün yol haritamıza ve ilgili ekibin değerlendirme listesine eklenmiştir.',
  },
];
