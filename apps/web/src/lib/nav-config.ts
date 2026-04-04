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
        module: 'invoicing',
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
