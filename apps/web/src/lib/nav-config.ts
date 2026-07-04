import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  BarChart3,
  FileText,
  ShoppingCart,
  BookOpen,
  CreditCard,
  Settings,
  Layers,
  ArrowLeftRight,
  ClipboardCheck,
  FileSignature,
  Receipt,
  CalendarRange,
  Banknote,
  Landmark,
  Coins,
  Truck,
  ClipboardList,
  BadgeDollarSign,
  Key,
  GitBranch,
  FileCheck,
  Building2,
  ScrollText,
  Scale,
  BookmarkCheck,
  Boxes,
  Hash,
  Shield,
  TrendingUp,
  Factory,
  Cog,
  Wrench,
  Monitor,
  Store,
  Link2,
  ShoppingBag,
  UserCheck,
  CalendarDays,
  Route,
  ClockIcon,
  Wallet,
  UploadCloud,
  Mail,
  FolderOpen,
  Bot,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { ACCESS_POLICIES } from './plans';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  module?: string;
  children?: NavItem[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const PROFESSIONAL_PLAN = ACCESS_POLICIES.purchasing.minPlan as NavItem['plan'];
const ENTERPRISE_PLAN = ACCESS_POLICIES.production.minPlan as NavItem['plan'];

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Ticaret',
    items: [
      { label: 'Cari Hesaplar', href: '/dashboard/contacts', icon: Users, module: 'contacts' },
      {
        label: 'Satış',
        href: '/dashboard/sales-orders',
        icon: ShoppingCart,
        module: 'sales',
        children: [
          { label: 'Teklifler', href: '/dashboard/sales-orders/quotes', icon: FileSignature, module: 'sales' },
          { label: 'Siparişler', href: '/dashboard/sales-orders', icon: ShoppingCart, module: 'sales' },
          { label: 'Faturalar', href: '/dashboard/invoices', icon: Receipt, module: 'invoicing' },
          { label: 'İrsaliyeler', href: '/dashboard/delivery-notes', icon: Truck, plan: PROFESSIONAL_PLAN, module: 'invoicing' },
          { label: 'E-Belgeler', href: '/dashboard/e-documents', icon: FileCheck, module: 'invoicing' },
        ],
      },
      {
        label: 'Satın Alma',
        href: '/dashboard/purchase-orders',
        icon: Truck,
        plan: PROFESSIONAL_PLAN,
        module: 'purchasing',
        children: [
          { label: 'Talepler', href: '/dashboard/purchase-orders/requests', icon: ClipboardList, module: 'purchasing' },
          { label: 'Siparişler', href: '/dashboard/purchase-orders', icon: Truck, plan: PROFESSIONAL_PLAN, module: 'purchasing' },
        ],
      },
    ],
  },
  {
    label: 'Stok & Operasyon',
    items: [
      {
        label: 'Ürünler & Stok',
        href: '/dashboard/products',
        icon: Package,
        module: 'inventory',
        children: [
          { label: 'Ürünler', href: '/dashboard/products', icon: Package, module: 'inventory' },
          { label: 'Depolar', href: '/dashboard/warehouses', icon: Warehouse, module: 'inventory' },
          { label: 'Stok Seviyeleri', href: '/dashboard/stock/levels', icon: Layers, module: 'inventory' },
          { label: 'Stok Hareketleri', href: '/dashboard/stock/movements', icon: ArrowLeftRight, module: 'inventory' },
          { label: 'Sayımlar', href: '/dashboard/stock/counts', icon: ClipboardCheck, module: 'inventory' },
          { label: 'Stok Değerleme', href: '/dashboard/stock-valuations', icon: TrendingUp, plan: PROFESSIONAL_PLAN, module: 'inventory' },
          { label: 'Rezervasyonlar', href: '/dashboard/reservations', icon: BookmarkCheck, plan: PROFESSIONAL_PLAN, module: 'inventory' },
          { label: 'Ürün Partileri', href: '/dashboard/product-batches', icon: Boxes, plan: PROFESSIONAL_PLAN, module: 'inventory' },
          { label: 'Lot / Seri No', href: '/dashboard/lot-serials', icon: Hash, plan: PROFESSIONAL_PLAN, module: 'inventory' },
        ],
      },
      {
        label: 'Üretim',
        href: '/dashboard/production/work-orders',
        icon: Factory,
        plan: ENTERPRISE_PLAN,
        module: 'production',
        children: [
          { label: 'MRP Planlama', href: '/dashboard/production/mrp', icon: GitBranch, plan: ENTERPRISE_PLAN, module: 'production' },
          { label: 'Kapasite Planlama', href: '/dashboard/production/capacity-planning', icon: CalendarRange, plan: ENTERPRISE_PLAN, module: 'production' },
          { label: 'Kalite Kontrol', href: '/dashboard/production/quality-control', icon: ClipboardCheck, plan: ENTERPRISE_PLAN, module: 'production' },
          { label: 'İş Emirleri', href: '/dashboard/production/work-orders', icon: ClipboardList, module: 'production' },
          { label: 'Ürün Ağaçları', href: '/dashboard/production/boms', icon: Layers, module: 'production' },
          { label: 'İş Merkezleri', href: '/dashboard/production/work-centers', icon: Cog, module: 'production' },
        ],
      },
      {
        label: 'Teknik Servis',
        href: '/dashboard/service/requests',
        icon: Wrench,
        plan: ENTERPRISE_PLAN,
        module: 'service',
        children: [
          { label: 'Bakım Yönetimi', href: '/dashboard/service/maintenance', icon: CalendarDays, plan: ENTERPRISE_PLAN, module: 'service' },
          { label: 'Saha Servis Mobil', href: '/dashboard/service/mobile-flow', icon: Route, plan: ENTERPRISE_PLAN, module: 'service' },
          { label: 'Servis Talepleri', href: '/dashboard/service/requests', icon: Wrench, module: 'service' },
          { label: 'Müşteri Varlıkları', href: '/dashboard/service/assets', icon: Monitor, module: 'service' },
        ],
      },
      {
        label: 'Pazaryeri',
        href: '/dashboard/marketplace/integrations',
        icon: Store,
        plan: ENTERPRISE_PLAN,
        module: 'marketplace',
        children: [
          { label: 'Entegrasyonlar', href: '/dashboard/marketplace/integrations', icon: Link2, plan: ENTERPRISE_PLAN, module: 'marketplace' },
          { label: 'Ürün Listelemeleri', href: '/dashboard/marketplace/listings', icon: ShoppingBag, module: 'marketplace' },
          { label: 'Siparişler', href: '/dashboard/marketplace/orders', icon: ShoppingCart, module: 'marketplace' },
        ],
      },
    ],
  },
  {
    label: 'Finans',
    items: [
      {
        label: 'Muhasebe',
        href: '/dashboard/accounting',
        icon: BookOpen,
        module: 'accounting',
        children: [
          { label: 'Hesap Planı', href: '/dashboard/accounting/accounts', icon: BookOpen, module: 'accounting' },
          { label: 'Yevmiye Fişleri', href: '/dashboard/accounting/journal-entries', icon: FileText, module: 'accounting' },
          { label: 'Mali Dönemler', href: '/dashboard/accounting/fiscal-periods', icon: CalendarRange, module: 'accounting' },
          { label: 'Mutabakat', href: '/dashboard/reconciliations', icon: Scale, plan: PROFESSIONAL_PLAN, module: 'accounting' },
        ],
      },
      {
        label: 'Ödemeler',
        href: '/dashboard/payments',
        icon: CreditCard,
        module: 'accounting',
        children: [
          { label: 'Ödemeler', href: '/dashboard/payments', icon: Banknote, module: 'accounting' },
          { label: 'Banka Hesapları', href: '/dashboard/payments/bank-accounts', icon: Landmark, module: 'accounting' },
          { label: 'Kasa Hesapları', href: '/dashboard/payments/cash-accounts', icon: Coins, module: 'accounting' },
          { label: 'Tahsilat Hatırlatıcıları', href: '/dashboard/collection-reminders', icon: ClockIcon, module: 'accounting' },
          { label: 'Banka Hareketleri', href: '/dashboard/bank-transactions', icon: Building2, plan: PROFESSIONAL_PLAN, module: 'accounting' },
          { label: 'Çek / Senet', href: '/dashboard/check-promissory', icon: ScrollText, plan: PROFESSIONAL_PLAN, module: 'accounting' },
        ],
      },
    ],
  },
  {
    label: 'Ekip & İletişim',
    items: [
      {
        label: 'İnsan Kaynakları',
        href: '/dashboard/hr/employees',
        icon: UserCheck,
        plan: ENTERPRISE_PLAN,
        module: 'hr',
        children: [
          { label: 'Gelişmiş İK', href: '/dashboard/hr/advanced', icon: GitBranch, plan: ENTERPRISE_PLAN, module: 'hr' },
          { label: 'Personel', href: '/dashboard/hr/employees', icon: UserCheck, plan: ENTERPRISE_PLAN, module: 'hr' },
          { label: 'İzin Talepleri', href: '/dashboard/hr/leave-requests', icon: CalendarDays, module: 'hr' },
          { label: 'Puantaj', href: '/dashboard/hr/attendance', icon: ClockIcon, module: 'hr' },
          { label: 'Bordro', href: '/dashboard/hr/payroll', icon: Wallet, plan: ENTERPRISE_PLAN, module: 'payroll' },
        ],
      },
      { label: 'Mail Merkezi', href: '/dashboard/mail', icon: Mail, plan: ENTERPRISE_PLAN, module: 'mail' },
    ],
  },
  {
    label: 'Analiz',
    items: [
      { label: 'Raporlar', href: '/dashboard/reports', icon: BarChart3, module: 'reporting' },
      { label: 'Döviz Kurları', href: '/dashboard/currency-rates', icon: BadgeDollarSign },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { label: 'Onay Akışları', href: '/dashboard/approvals', icon: GitBranch, plan: PROFESSIONAL_PLAN, module: 'approvals' },
      { label: 'İş Akışı Merkezi', href: '/dashboard/workflow', icon: ClipboardCheck, plan: PROFESSIONAL_PLAN },
      { label: 'Toplu Islem Merkezi', href: '/dashboard/bulk-operations', icon: ListChecks, plan: PROFESSIONAL_PLAN },
      { label: 'Doküman Merkezi', href: '/dashboard/documents', icon: FolderOpen },
      {
        label: 'İçe / Dışa Aktarma',
        href: '/dashboard/data-exchange',
        icon: UploadCloud,
        children: [
          { label: 'CSV Veri Aktarımı', href: '/dashboard/data-exchange', icon: UploadCloud },
          { label: 'EDI / B2B Entegrasyonları', href: '/dashboard/data-exchange/b2b', icon: Link2, plan: ENTERPRISE_PLAN, module: 'marketplace' },
        ],
      },
      { label: 'Rol Yönetimi', href: '/dashboard/roles', icon: Shield, plan: PROFESSIONAL_PLAN },
      { label: 'API Anahtarları', href: '/dashboard/api-keys', icon: Key, plan: PROFESSIONAL_PLAN },
    ],
  },
  {
    label: 'Ayarlar',
    items: [
      {
        label: 'Ayarlar',
        href: '/dashboard/settings',
        icon: Settings,
        children: [
          { label: 'Genel Ayarlar', href: '/dashboard/settings', icon: Settings },
          { label: 'AI Governance', href: '/dashboard/settings/ai-governance', icon: Bot, plan: ENTERPRISE_PLAN },
        ],
      },
    ],
  },
];

