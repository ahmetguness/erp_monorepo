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
  ClockIcon,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Nav item types
// ─────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Module key — if set, checked against tenant.modules */
  module?: string;
  /** Plan requirement — 'PROFESSIONAL' or 'ENTERPRISE' */
  plan?: string;
  children?: NavItem[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

// ─────────────────────────────────────────────
// Navigation config
// ─────────────────────────────────────────────

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Cari & Ürün',
    items: [
      { label: 'Cari Hesaplar', href: '/dashboard/contacts', icon: Users, module: 'contacts' },
      {
        label: 'Ürünler & Stok',
        href: '/dashboard/products',
        icon: Package,
        module: 'inventory',
        children: [
          { label: 'Ürünler', href: '/dashboard/products', icon: Package },
          { label: 'Depolar', href: '/dashboard/warehouses', icon: Warehouse },
          { label: 'Stok Seviyeleri', href: '/dashboard/stock/levels', icon: Layers },
          { label: 'Stok Hareketleri', href: '/dashboard/stock/movements', icon: ArrowLeftRight },
          { label: 'Sayımlar', href: '/dashboard/stock/counts', icon: ClipboardCheck },
          { label: 'Stok Değerleme', href: '/dashboard/stock-valuations', icon: TrendingUp, plan: 'PROFESSIONAL' },
          { label: 'Rezervasyonlar', href: '/dashboard/reservations', icon: BookmarkCheck, plan: 'PROFESSIONAL' },
          { label: 'Ürün Partileri', href: '/dashboard/product-batches', icon: Boxes, plan: 'PROFESSIONAL' },
          { label: 'Lot / Seri No', href: '/dashboard/lot-serials', icon: Hash, plan: 'PROFESSIONAL' },
        ],
      },
    ],
  },
  {
    label: 'Satış',
    items: [
      {
        label: 'Satış',
        href: '/dashboard/sales-orders',
        icon: ShoppingCart,
        module: 'invoicing',
        children: [
          { label: 'Teklifler', href: '/dashboard/sales-orders/quotes', icon: FileSignature },
          { label: 'Siparişler', href: '/dashboard/sales-orders', icon: ShoppingCart },
          { label: 'Faturalar', href: '/dashboard/invoices', icon: Receipt },
          { label: 'İrsaliyeler', href: '/dashboard/delivery-notes', icon: Truck, plan: 'PROFESSIONAL' },
          { label: 'E-Belgeler', href: '/dashboard/e-documents', icon: FileCheck, plan: 'PROFESSIONAL' },
        ],
      },
    ],
  },
  {
    label: 'Satın Alma',
    items: [
      {
        label: 'Satın Alma',
        href: '/dashboard/purchase-orders',
        icon: Truck,
        module: 'purchasing',
        plan: 'PROFESSIONAL',
        children: [
          { label: 'Talepler', href: '/dashboard/purchase-orders/requests', icon: ClipboardList },
          { label: 'Siparişler', href: '/dashboard/purchase-orders', icon: Truck },
        ],
      },
    ],
  },
  {
    label: 'Muhasebe',
    items: [
      {
        label: 'Muhasebe',
        href: '/dashboard/accounting',
        icon: BookOpen,
        module: 'accounting',
        children: [
          { label: 'Hesap Planı', href: '/dashboard/accounting/accounts', icon: BookOpen },
          { label: 'Yevmiye Fişleri', href: '/dashboard/accounting/journal-entries', icon: FileText },
          { label: 'Mali Dönemler', href: '/dashboard/accounting/fiscal-periods', icon: CalendarRange },
          { label: 'Mutabakat', href: '/dashboard/reconciliations', icon: Scale, plan: 'PROFESSIONAL' },
        ],
      },
      {
        label: 'Ödemeler',
        href: '/dashboard/payments',
        icon: CreditCard,
        module: 'accounting',
        children: [
          { label: 'Ödemeler', href: '/dashboard/payments', icon: Banknote },
          { label: 'Banka Hesapları', href: '/dashboard/payments/bank-accounts', icon: Landmark },
          { label: 'Kasa Hesapları', href: '/dashboard/payments/cash-accounts', icon: Coins },
          { label: 'Banka Hareketleri', href: '/dashboard/bank-transactions', icon: Building2, plan: 'PROFESSIONAL' },
          { label: 'Çek / Senet', href: '/dashboard/check-promissory', icon: ScrollText, plan: 'PROFESSIONAL' },
        ],
      },
    ],
  },
  {
    label: 'Raporlar',
    items: [
      { label: 'Raporlar', href: '/dashboard/reports', icon: BarChart3, module: 'reporting' },
      { label: 'Döviz Kurları', href: '/dashboard/currency-rates', icon: BadgeDollarSign },
    ],
  },
  {
    label: 'Üretim',
    items: [
      {
        label: 'Üretim',
        href: '/dashboard/production/work-orders',
        icon: Factory,
        module: 'production',
        plan: 'ENTERPRISE',
        children: [
          { label: 'İş Emirleri', href: '/dashboard/production/work-orders', icon: ClipboardList },
          { label: 'Ürün Ağaçları', href: '/dashboard/production/boms', icon: Layers },
          { label: 'İş Merkezleri', href: '/dashboard/production/work-centers', icon: Cog },
        ],
      },
    ],
  },
  {
    label: 'Teknik Servis',
    items: [
      {
        label: 'Teknik Servis',
        href: '/dashboard/service/requests',
        icon: Wrench,
        module: 'service',
        children: [
          { label: 'Servis Talepleri', href: '/dashboard/service/requests', icon: Wrench },
          { label: 'Müşteri Varlıkları', href: '/dashboard/service/assets', icon: Monitor },
        ],
      },
    ],
  },
  {
    label: 'Pazaryeri',
    items: [
      {
        label: 'Pazaryeri',
        href: '/dashboard/marketplace/integrations',
        icon: Store,
        module: 'marketplace',
        plan: 'ENTERPRISE',
        children: [
          { label: 'Entegrasyonlar', href: '/dashboard/marketplace/integrations', icon: Link2 },
          { label: 'Ürün Listelemeleri', href: '/dashboard/marketplace/listings', icon: ShoppingBag },
          { label: 'Siparişler', href: '/dashboard/marketplace/orders', icon: ShoppingCart },
        ],
      },
    ],
  },
  {
    label: 'İnsan Kaynakları',
    items: [
      {
        label: 'İnsan Kaynakları',
        href: '/dashboard/hr/employees',
        icon: UserCheck,
        module: 'hr',
        children: [
          { label: 'Personel', href: '/dashboard/hr/employees', icon: UserCheck },
          { label: 'İzin Talepleri', href: '/dashboard/hr/leave-requests', icon: CalendarDays },
          { label: 'Puantaj', href: '/dashboard/hr/attendance', icon: ClockIcon },
          { label: 'Bordro', href: '/dashboard/hr/payroll', icon: Wallet, plan: 'ENTERPRISE' },
        ],
      },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { label: 'Onay Akışları', href: '/dashboard/approvals', icon: GitBranch, plan: 'PROFESSIONAL' },
      { label: 'Rol Yönetimi', href: '/dashboard/roles', icon: Shield, plan: 'PROFESSIONAL' },
      { label: 'API Anahtarları', href: '/dashboard/api-keys', icon: Key, plan: 'PROFESSIONAL' },
    ],
  },
  {
    label: 'Ayarlar',
    items: [
      { label: 'Ayarlar', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

// Starter plan open modules
export const STARTER_MODULES = new Set([
  'accounting',
  'inventory',
  'contacts',
  'invoicing',
  'reporting',
]);
