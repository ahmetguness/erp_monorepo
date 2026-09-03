import type { NavigationGoal, NavigationPersona } from './navigation-workspace.types.js';

export const NAVIGATION_MODULES = new Set([
  'contacts', 'sales', 'invoicing', 'purchasing', 'inventory', 'production', 'service', 'marketplace',
  'accounting', 'hr', 'payroll', 'mail', 'reporting', 'approvals', 'workflow', 'attachments', 'roles', 'settings',
  'operations', 'api_keys', 'ai_governance', 'holding', 'documents',
]);

export function isNavigationHref(href: string): boolean {
  return href === '/dashboard' || (href.startsWith('/dashboard/') && !href.includes('\\') && !href.includes('//') && !href.includes('?') && !href.includes('#'));
}

const GOALS: readonly (NavigationGoal & { personas: readonly Exclude<NavigationPersona, 'AUTO'>[] })[] = [
  { id: 'sell', label: 'Satış yap', description: 'Tekliften siparişe satış başlat', href: '/dashboard/sales-orders/quotes/new', module: 'sales', personas: ['SALES', 'MANAGEMENT'] },
  { id: 'collect', label: 'Tahsil et', description: 'Yeni tahsilat veya ödeme kaydı aç', href: '/dashboard/payments/new', module: 'accounting', personas: ['FINANCE', 'MANAGEMENT'] },
  { id: 'replenish', label: 'Stok tamamla', description: 'Stok seviyelerini ve ihtiyaçları incele', href: '/dashboard/stock/levels', module: 'inventory', personas: ['OPERATIONS', 'MANAGEMENT'] },
  { id: 'purchase', label: 'Satın al', description: 'Satın alma siparişi başlat', href: '/dashboard/purchase-orders', module: 'purchasing', personas: ['OPERATIONS', 'MANAGEMENT'] },
  { id: 'people', label: 'Ekibi yönet', description: 'Personel çalışma alanını aç', href: '/dashboard/hr/employees', module: 'hr', personas: ['PEOPLE', 'MANAGEMENT'] },
  { id: 'review', label: 'İşi gözden geçir', description: 'Onay bekleyen işleri incele', href: '/dashboard/approvals', module: 'approvals', personas: ['MANAGEMENT', 'FINANCE'] },
];

export function inferPersona(modules: readonly string[]): Exclude<NavigationPersona, 'AUTO'> {
  const scores = {
    SALES: modules.filter((module) => ['sales', 'invoicing', 'contacts'].includes(module)).length,
    FINANCE: modules.filter((module) => ['accounting', 'reporting'].includes(module)).length,
    OPERATIONS: modules.filter((module) => ['inventory', 'purchasing', 'production', 'service', 'marketplace'].includes(module)).length,
    PEOPLE: modules.filter((module) => ['hr', 'payroll'].includes(module)).length,
    MANAGEMENT: modules.filter((module) => ['approvals', 'roles', 'settings'].includes(module)).length,
  } satisfies Record<Exclude<NavigationPersona, 'AUTO'>, number>;
  return (Object.entries(scores).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'MANAGEMENT') as Exclude<NavigationPersona, 'AUTO'>;
}

export function goalsFor(persona: Exclude<NavigationPersona, 'AUTO'>, canAccess: (module: string) => boolean): NavigationGoal[] {
  return GOALS.filter((goal) => goal.personas.includes(persona) && (!goal.module || canAccess(goal.module)))
    .slice(0, 4)
    .map(({ personas: _personas, ...goal }) => goal);
}
