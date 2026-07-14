import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  KeyRound,
  LifeBuoy,
  ListChecks,
  PlugZap,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { PlanName } from '@/lib/plans';

export interface PlanRecommendedAction {
  key: string;
  title: string;
  detail: string;
  href: string;
  icon: LucideIcon;
}

const STARTER_ACTIONS: readonly PlanRecommendedAction[] = [
  {
    key: 'setup-checklist',
    title: 'Kurulumu tamamla',
    detail: 'Sirket, vergi, doviz ve temel katalog ayarlarini bitir.',
    href: '/dashboard/settings',
    icon: ListChecks,
  },
  {
    key: 'usage-limits',
    title: 'Limitleri izle',
    detail: 'Kullanici, urun, depo ve storage dolulugunu kontrol et.',
    href: '/dashboard/upgrade-preview',
    icon: SlidersHorizontal,
  },
  {
    key: 'starter-support',
    title: 'E-fatura akisini dogrula',
    detail: 'Belge merkezi ve fatura surecini ilk satis oncesi hazirla.',
    href: '/dashboard/e-documents',
    icon: LifeBuoy,
  },
];

const PROFESSIONAL_ACTIONS: readonly PlanRecommendedAction[] = [
  {
    key: 'workflow-automation',
    title: 'Otomasyon kur',
    detail: 'Onay, bildirim ve tekrar eden gorevleri is akisina bagla.',
    href: '/dashboard/workflow',
    icon: Bot,
  },
  {
    key: 'custom-reporting',
    title: 'Rapor setini genislet',
    detail: 'Nakit akisi, mutabakat ve ozel KPI kartlarini hazirla.',
    href: '/dashboard/reports',
    icon: BarChart3,
  },
  {
    key: 'api-keys',
    title: 'API erisimini guvenceye al',
    detail: 'Scope ve IP allowlist ile entegrasyon anahtarlarini duzenle.',
    href: '/dashboard/api-keys',
    icon: KeyRound,
  },
];

const ENTERPRISE_ACTIONS: readonly PlanRecommendedAction[] = [
  {
    key: 'security-governance',
    title: 'Guvenlik merkezini sertlestir',
    detail: 'Audit, SIEM, veri saklama ve oturum kontrollerini gozden gecir.',
    href: '/dashboard/settings/security',
    icon: ShieldCheck,
  },
  {
    key: 'marketplace-integrations',
    title: 'Entegrasyonlari bagla',
    detail: 'Pazaryeri, mail ve B2B kanallarini operasyon akisiniza ekle.',
    href: '/dashboard/marketplace/integrations',
    icon: PlugZap,
  },
  {
    key: 'ai-governance',
    title: 'AI yonetisim ayarla',
    detail: 'AI kullanim politikalari ve guvenli otomasyon kurallarini netlestir.',
    href: '/dashboard/settings/ai-governance',
    icon: Bot,
  },
];

const ACTIONS_BY_PLAN: Record<PlanName, readonly PlanRecommendedAction[]> = {
  STARTER: STARTER_ACTIONS,
  PROFESSIONAL: PROFESSIONAL_ACTIONS,
  ENTERPRISE: ENTERPRISE_ACTIONS,
};

export function getPlanRecommendedActions(plan: PlanName): readonly PlanRecommendedAction[] {
  return ACTIONS_BY_PLAN[plan];
}
