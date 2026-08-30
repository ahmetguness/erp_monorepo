import type { QuickStartDTO } from '@/services/settings.service';

type Option<T extends string> = Readonly<{ value: T; label: string; description?: string }>;

export const INDUSTRY_OPTIONS: readonly Option<QuickStartDTO['industry']>[] = [
  { value: 'RETAIL', label: 'Perakende' },
  { value: 'WHOLESALE', label: 'Toptan satış' },
  { value: 'SERVICES', label: 'Hizmet' },
  { value: 'MANUFACTURING', label: 'Üretim' },
  { value: 'ECOMMERCE', label: 'E-ticaret' },
  { value: 'OTHER', label: 'Diğer' },
];

export const SCALE_OPTIONS: readonly Option<QuickStartDTO['companyScale']>[] = [
  { value: 'MICRO', label: 'Mikro', description: '1-9 çalışan' },
  { value: 'SMALL', label: 'Küçük', description: '10-49 çalışan' },
  { value: 'MEDIUM', label: 'Orta', description: '50-249 çalışan' },
  { value: 'LARGE', label: 'Büyük', description: '250+ çalışan' },
];

export const GOAL_OPTIONS: readonly Option<QuickStartDTO['primaryGoal']>[] = [
  { value: 'SALES', label: 'Satış ve faturalama' },
  { value: 'FINANCE', label: 'Finans ve nakit akışı' },
  { value: 'INVENTORY', label: 'Stok yönetimi' },
  { value: 'PROCUREMENT', label: 'Satın alma' },
  { value: 'PRODUCTION', label: 'Üretim' },
  { value: 'SERVICE', label: 'Servis operasyonu' },
];

export const COUNTRY_OPTIONS: readonly Option<string>[] = [
  { value: 'TR', label: 'Türkiye' },
  { value: 'DE', label: 'Almanya' },
  { value: 'GB', label: 'Birleşik Krallık' },
  { value: 'US', label: 'Amerika Birleşik Devletleri' },
];
