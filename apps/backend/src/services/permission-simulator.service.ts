import { FeatureKey, PermissionAction, Plan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { isPlanAtLeast } from '../types/plan.types';
import { hasTenantModuleAccess } from '../utils/tenant-modules';
import { TenantFeatureService } from './tenant-feature.service';

export interface PermissionMatrixEntry {
  id: string;
  label: string;
  route: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  module: string;
  action: PermissionAction;
  moduleGate?: string;
  minPlan?: Plan;
  featureKey?: FeatureKey;
  webHref?: string;
  webAction: string;
}

export interface PermissionSimulationInput {
  userId: string;
  module: string;
  action: PermissionAction;
  routeId?: string;
}

export interface PermissionSimulationGate {
  key: 'tenant' | 'module' | 'plan' | 'feature' | 'permission';
  label: string;
  allowed: boolean;
  reason: string;
}

export interface PermissionSimulationResult {
  allowed: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    isOwner: boolean;
    roleId: string | null;
    roleName: string | null;
  };
  tenant: {
    plan: Plan;
    modules: string[];
  };
  requested: {
    module: string;
    action: PermissionAction;
    route: PermissionMatrixEntry | null;
  };
  explanation: {
    summary: string;
    blockers: string[];
    nextSteps: string[];
  };
  gates: PermissionSimulationGate[];
  matchingRoutes: PermissionMatrixEntry[];
}

export interface PermissionScreenPreviewInput {
  userId: string;
}

export interface PermissionScreenPreviewItem {
  routeId: string;
  label: string;
  href: string;
  module: string;
  action: PermissionAction;
  webAction: string;
  minPlan: Plan | null;
  featureKey: FeatureKey | null;
  allowed: boolean;
  gates: PermissionSimulationGate[];
  blockers: string[];
}

export interface PermissionScreenPreviewResult {
  user: PermissionSimulationResult['user'];
  tenant: PermissionSimulationResult['tenant'];
  summary: {
    visibleCount: number;
    blockedCount: number;
    totalCount: number;
  };
  screens: PermissionScreenPreviewItem[];
}

const permissionMatrix: readonly PermissionMatrixEntry[] = [
  { id: 'contacts:list', label: 'Cari listesi', route: '/api/contacts', method: 'GET', module: 'contacts', action: PermissionAction.READ, moduleGate: 'contacts', webHref: '/dashboard/contacts', webAction: 'Cari menusu gorunur' },
  { id: 'contacts:create', label: 'Cari olustur', route: '/api/contacts', method: 'POST', module: 'contacts', action: PermissionAction.CREATE, moduleGate: 'contacts', webAction: 'Yeni cari butonu' },
  { id: 'invoices:list', label: 'Fatura listesi', route: '/api/invoices', method: 'GET', module: 'invoicing', action: PermissionAction.READ, moduleGate: 'invoicing', webHref: '/dashboard/invoices', webAction: 'Faturalar menusu gorunur' },
  { id: 'invoices:create', label: 'Fatura olustur', route: '/api/invoices', method: 'POST', module: 'invoicing', action: PermissionAction.CREATE, moduleGate: 'invoicing', webAction: 'Yeni fatura butonu' },
  { id: 'payments:create', label: 'Odeme kaydet', route: '/api/payments', method: 'POST', module: 'accounting', action: PermissionAction.CREATE, moduleGate: 'accounting', webAction: 'Odeme ekle aksiyonu' },
  { id: 'accounting:closing-checklist', label: 'Mali donem kapanis kontrolu', route: '/api/accounting/fiscal-periods/:id/closing-checklist', method: 'GET', module: 'accounting', action: PermissionAction.READ, moduleGate: 'accounting', webAction: 'Kapanis kontrol listesini goruntule', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.BANK_RECONCILIATION },
  { id: 'bank-transactions:list', label: 'Banka hareketleri', route: '/api/bank-transactions', method: 'GET', module: 'accounting', action: PermissionAction.READ, moduleGate: 'accounting', webHref: '/dashboard/bank-transactions', webAction: 'Banka hareketleri sayfasi', minPlan: Plan.PROFESSIONAL },
  { id: 'stock:movements', label: 'Stok hareketleri', route: '/api/stock/movements', method: 'GET', module: 'inventory', action: PermissionAction.READ, moduleGate: 'inventory', webHref: '/dashboard/stock/movements', webAction: 'Stok hareketleri sayfasi' },
  { id: 'stock:advanced-suggestions', label: 'Gelismis stok onerileri', route: '/api/stock/advanced-suggestions', method: 'GET', module: 'inventory', action: PermissionAction.READ, moduleGate: 'inventory', webAction: 'Gelismis stok onerilerini goruntule', minPlan: Plan.PROFESSIONAL },
  { id: 'reports:summary', label: 'Hazir raporlar', route: '/api/reports/revenue-summary', method: 'GET', module: 'reporting', action: PermissionAction.READ, moduleGate: 'reporting', webHref: '/dashboard/reports', webAction: 'Hazir raporlar sayfasi' },
  { id: 'reports:cashflow-forecast', label: 'Nakit akis tahmini', route: '/api/reports/cashflow-forecast', method: 'GET', module: 'reporting', action: PermissionAction.READ, moduleGate: 'reporting', webAction: 'Nakit akis tahminini goruntule', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.CASHFLOW_FORECAST },
  { id: 'reports:custom-registry', label: 'Ozel rapor registry', route: '/api/reports/registry', method: 'GET', module: 'reporting', action: PermissionAction.READ, moduleGate: 'reporting', webHref: '/dashboard/reports', webAction: 'Ozel rapor olusturma araclarini goruntule', featureKey: FeatureKey.CUSTOM_REPORTING },
  { id: 'purchase-orders:list', label: 'Satin alma siparisleri', route: '/api/purchase-orders', method: 'GET', module: 'purchasing', action: PermissionAction.READ, moduleGate: 'purchasing', webHref: '/dashboard/purchase-orders', webAction: 'Satin alma menusu', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.PURCHASING },
  { id: 'delivery-notes:create', label: 'Irsaliye olustur', route: '/api/delivery-notes', method: 'POST', module: 'invoicing', action: PermissionAction.CREATE, moduleGate: 'invoicing', webHref: '/dashboard/delivery-notes', webAction: 'Yeni irsaliye butonu', minPlan: Plan.PROFESSIONAL },
  { id: 'e-documents:summary', label: 'E-belge ozeti', route: '/api/e-documents/summary', method: 'GET', module: 'invoicing', action: PermissionAction.READ, moduleGate: 'invoicing', webHref: '/dashboard/e-documents', webAction: 'E-belge ozetini goruntule', minPlan: Plan.STARTER },
  { id: 'notifications:smart', label: 'Akilli bildirimler', route: '/api/notifications/smart', method: 'GET', module: 'notifications', action: PermissionAction.READ, webAction: 'Akilli bildirimleri goruntule', minPlan: Plan.STARTER, featureKey: FeatureKey.SMART_NOTIFICATIONS },
  { id: 'roles:list', label: 'Rol yonetimi', route: '/api/roles', method: 'GET', module: 'roles', action: PermissionAction.READ, webHref: '/dashboard/roles', webAction: 'Rol yonetimi sayfasi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.ROLE_MANAGEMENT },
  { id: 'approvals:list', label: 'Onay akislari', route: '/api/approvals/flows', method: 'GET', module: 'approvals', action: PermissionAction.READ, moduleGate: 'approvals', webHref: '/dashboard/approvals', webAction: 'Onay merkezi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.APPROVALS },
  { id: 'workflow:rules', label: 'Is akisi kurallari', route: '/api/automation-rules', method: 'GET', module: 'settings', action: PermissionAction.READ, moduleGate: 'workflow', webHref: '/dashboard/workflow', webAction: 'Is akisi merkezi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.WORKFLOW_CENTER },
  { id: 'audit-log:export', label: 'Audit log export', route: '/api/audit-logs/export', method: 'GET', module: 'audit_logs', action: PermissionAction.EXPORT, webAction: 'Audit loglarini disa aktar', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.AUDIT_LOG },
  { id: 'documents:library', label: 'Dokuman kutuphanesi', route: '/api/attachments/library', method: 'GET', module: 'attachments', action: PermissionAction.READ, moduleGate: 'documents', webHref: '/dashboard/documents', webAction: 'Dokuman merkezini goruntule', minPlan: Plan.STARTER, featureKey: FeatureKey.DOCUMENT_CENTER },
  { id: 'lot-serials:list', label: 'Lot seri takibi', route: '/api/lot-serials', method: 'GET', module: 'inventory', action: PermissionAction.READ, moduleGate: 'inventory', webHref: '/dashboard/lot-serials', webAction: 'Lot seri takip sayfasi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.LOT_SERIAL_TRACKING },
  { id: 'bulk-operations:contacts-preview', label: 'Toplu islem onizleme', route: '/api/bulk-operations/contacts/preview', method: 'POST', module: 'contacts', action: PermissionAction.UPDATE, webHref: '/dashboard/bulk-operations', webAction: 'Toplu islem onizlemesi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.BULK_OPERATIONS },
  { id: 'hr:employees', label: 'Personel listesi', route: '/api/hr/employees', method: 'GET', module: 'hr', action: PermissionAction.READ, moduleGate: 'hr', webHref: '/dashboard/hr/employees', webAction: 'IK menusu', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.HR },
  { id: 'payroll:list', label: 'Bordro listesi', route: '/api/payroll', method: 'GET', module: 'payroll', action: PermissionAction.READ, moduleGate: 'payroll', webHref: '/dashboard/hr/payroll', webAction: 'Bordro sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PAYROLL },
  { id: 'payroll:bank-file', label: 'Banka odeme dosyasi', route: '/api/payroll/integration/bank-file', method: 'GET', module: 'payroll', action: PermissionAction.EXPORT, moduleGate: 'payroll', webAction: 'Banka odeme listesi indir', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PAYROLL },
  { id: 'payroll:accounting-voucher', label: 'Muhasebe fisi otomasyonu', route: '/api/payroll/integration/accounting-voucher', method: 'POST', module: 'payroll', action: PermissionAction.UPDATE, moduleGate: 'payroll', webAction: 'Muhasebe fisi olustur', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PAYROLL },
  { id: 'payroll:closing-checks', label: 'Donemsel bordro kapanis kontrolleri', route: '/api/payroll/integration/closing-checks', method: 'GET', module: 'payroll', action: PermissionAction.READ, moduleGate: 'payroll', webAction: 'Kapanis kontrollerini calistir', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PAYROLL },
  { id: 'marketplace:integrations', label: 'Pazaryeri entegrasyonlari', route: '/api/marketplace/integrations', method: 'GET', module: 'marketplace', action: PermissionAction.READ, moduleGate: 'marketplace', webHref: '/dashboard/marketplace/integrations', webAction: 'Pazaryeri menusu', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.MARKETPLACE },
  { id: 'api-keys:list', label: 'API anahtarlari', route: '/api/api-keys', method: 'GET', module: 'api_keys', action: PermissionAction.READ, webHref: '/dashboard/api-keys', webAction: 'API anahtarlari sayfasi', minPlan: Plan.PROFESSIONAL, featureKey: FeatureKey.API_ACCESS },
  { id: 'mail:center', label: 'Mail merkezi', route: '/api/mail', method: 'GET', module: 'mail', action: PermissionAction.READ, moduleGate: 'mail', webHref: '/dashboard/mail', webAction: 'Mail merkezi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.MAIL_CENTER },
  { id: 'hr:advanced', label: 'Gelismis IK', route: '/api/hr/advanced', method: 'GET', module: 'hr', action: PermissionAction.READ, moduleGate: 'hr', webHref: '/dashboard/hr/advanced', webAction: 'Gelismis IK sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.HR },
  { id: 'production:capacity-planning', label: 'Kapasite planlama', route: '/api/production/capacity-planning', method: 'GET', module: 'production', action: PermissionAction.READ, moduleGate: 'production', webHref: '/dashboard/production/capacity-planning', webAction: 'Kapasite planlama sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PRODUCTION },
  { id: 'production:mrp', label: 'MRP planlama', route: '/api/production/mrp', method: 'GET', module: 'production', action: PermissionAction.READ, moduleGate: 'production', webHref: '/dashboard/production/mrp', webAction: 'MRP planlama sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PRODUCTION },
  { id: 'production:quality-control', label: 'Kalite kontrol', route: '/api/production/quality-control', method: 'GET', module: 'production', action: PermissionAction.READ, moduleGate: 'production', webHref: '/dashboard/production/quality-control', webAction: 'Kalite kontrol sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.PRODUCTION },
  { id: 'service:maintenance', label: 'Bakim yonetimi', route: '/api/service/maintenance', method: 'GET', module: 'service', action: PermissionAction.READ, moduleGate: 'service', webHref: '/dashboard/service/maintenance', webAction: 'Bakim yonetimi sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.SERVICE },
  { id: 'service:mobile-flow', label: 'Saha servis mobil', route: '/api/service/mobile-flow', method: 'GET', module: 'service', action: PermissionAction.READ, moduleGate: 'service', webHref: '/dashboard/service/mobile-flow', webAction: 'Saha servis mobil sayfasi', minPlan: Plan.ENTERPRISE, featureKey: FeatureKey.SERVICE },
  { id: 'chat:send', label: 'AI asistan', route: '/api/chat', method: 'POST', module: 'chat', action: PermissionAction.CREATE, webAction: 'Chat paneli', minPlan: Plan.ENTERPRISE },
  { id: 'ai-governance:logs', label: 'AI denetim kayitlari', route: '/api/intelligence/ai-governance/logs', method: 'GET', module: 'ai_governance', action: PermissionAction.READ, webHref: '/dashboard/settings/ai-governance', webAction: 'AI loglarini goruntule', minPlan: Plan.ENTERPRISE },
  { id: 'ai-governance:policy-view', label: 'AI politika goruntuleme', route: '/api/intelligence/ai-governance/policy', method: 'GET', module: 'ai_governance', action: PermissionAction.READ, webHref: '/dashboard/settings/ai-governance', webAction: 'AI politikasini goruntule', minPlan: Plan.ENTERPRISE },
  { id: 'ai-governance:policy-update', label: 'AI politika guncelleme', route: '/api/intelligence/ai-governance/policy', method: 'PUT', module: 'ai_governance', action: PermissionAction.UPDATE, webAction: 'AI politikasini kaydet', minPlan: Plan.ENTERPRISE },
];

const featureService = new TenantFeatureService(prisma);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${key} alani zorunludur.`);
  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${key} metin olmalidir.`);
  return value.trim() || undefined;
}

function parsePermissionAction(value: string): PermissionAction {
  switch (value) {
    case PermissionAction.CREATE:
      return PermissionAction.CREATE;
    case PermissionAction.READ:
      return PermissionAction.READ;
    case PermissionAction.UPDATE:
      return PermissionAction.UPDATE;
    case PermissionAction.DELETE:
      return PermissionAction.DELETE;
    case PermissionAction.APPROVE:
      return PermissionAction.APPROVE;
    case PermissionAction.EXPORT:
      return PermissionAction.EXPORT;
    default:
      throw new ValidationError('Gecersiz izin aksiyonu.');
  }
}

export function parsePermissionSimulationInput(value: unknown): PermissionSimulationInput {
  if (!isRecord(value)) throw new ValidationError('Gecersiz simulasyon istegi.');
  return {
    userId: readRequiredString(value, 'userId'),
    module: readRequiredString(value, 'module'),
    action: parsePermissionAction(readRequiredString(value, 'action')),
    routeId: readOptionalString(value, 'routeId'),
  };
}

export function parsePermissionScreenPreviewInput(value: unknown): PermissionScreenPreviewInput {
  if (!isRecord(value)) throw new ValidationError('Gecersiz ekran onizleme istegi.');
  return { userId: readRequiredString(value, 'userId') };
}

function hasModuleAccess(tenant: { plan: Plan; modules: readonly string[] }, moduleGate: string | undefined): boolean {
  if (!moduleGate) return true;
  return hasTenantModuleAccess(tenant, moduleGate);
}

export function listPermissionMatrix(): PermissionMatrixEntry[] {
  return [...permissionMatrix];
}

interface PermissionSubject {
  tenant: {
    plan: Plan;
    modules: string[];
  };
  tenantUser: {
    userId: string;
    isOwner: boolean;
    roleId: string | null;
    user: {
      name: string;
      email: string;
    };
    roleRef: {
      name: string;
      permissions: Array<{ module: string; action: PermissionAction }>;
    } | null;
  };
}

async function loadPermissionSubject(tenantId: string, userId: string): Promise<PermissionSubject> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { plan: true, modules: true },
  });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true } },
    select: {
      userId: true,
      isOwner: true,
      roleId: true,
      user: { select: { name: true, email: true } },
      roleRef: { select: { name: true, permissions: { select: { module: true, action: true } } } },
    },
  });
  if (!tenantUser) throw new ForbiddenError('Secilen kullanici bu tenant icinde aktif degil.');

  return { tenant, tenantUser };
}

function buildUserSummary(subject: PermissionSubject): PermissionSimulationResult['user'] {
  return {
    id: subject.tenantUser.userId,
    name: subject.tenantUser.user.name,
    email: subject.tenantUser.user.email,
    isOwner: subject.tenantUser.isOwner,
    roleId: subject.tenantUser.roleId,
    roleName: subject.tenantUser.roleRef?.name ?? null,
  };
}

function hasRolePermission(subject: PermissionSubject, module: string, action: PermissionAction): boolean {
  return subject.tenantUser.isOwner ||
    (subject.tenantUser.roleRef?.permissions.some((permission) => permission.module === module && permission.action === action) ?? false);
}

async function buildSimulationGates(
  tenantId: string,
  subject: PermissionSubject,
  route: PermissionMatrixEntry | null,
  module: string,
  action: PermissionAction,
): Promise<PermissionSimulationGate[]> {
  const moduleAllowed = hasModuleAccess(subject.tenant, route?.moduleGate ?? module);
  const planAllowed = route?.minPlan ? isPlanAtLeast(subject.tenant.plan, route.minPlan) : true;
  const featureAllowed = route?.featureKey ? await featureService.isFeatureEnabled(tenantId, route.featureKey) : true;
  const permissionAllowed = hasRolePermission(subject, module, action);

  return [
    {
      key: 'tenant',
      label: 'Tenant uyeligi',
      allowed: true,
      reason: 'Kullanici tenant icinde aktif.',
    },
    {
      key: 'module',
      label: 'Modul erisimi',
      allowed: moduleAllowed,
      reason: moduleAllowed ? 'Tenant modulu kullanabilir.' : `Tenant modulu kapali: ${route?.moduleGate ?? module}`,
    },
    {
      key: 'plan',
      label: 'Plan seviyesi',
      allowed: planAllowed,
      reason: route?.minPlan ? `Gerekli plan: ${route.minPlan}, mevcut plan: ${subject.tenant.plan}` : 'Bu aksiyon icin ek plan kosulu yok.',
    },
    {
      key: 'feature',
      label: 'Feature gate',
      allowed: featureAllowed,
      reason: route?.featureKey ? `Feature: ${route.featureKey}` : 'Bu aksiyon icin ek feature kosulu yok.',
    },
    {
      key: 'permission',
      label: 'Rol izni',
      allowed: permissionAllowed,
      reason: subject.tenantUser.isOwner ? 'Owner kullanici tum izinleri gecer.' : `${module}:${action}`,
    },
  ];
}

function buildExplanation(gates: readonly PermissionSimulationGate[], route: PermissionMatrixEntry | null): PermissionSimulationResult['explanation'] {
  const blockers = gates.filter((gate) => !gate.allowed).map((gate) => `${gate.label}: ${gate.reason}`);
  const nextSteps = blockers.length === 0
    ? ['Bu kullanici icin backend route, plan, modul, feature ve rol izinleri uyumlu.']
    : gates.flatMap((gate) => {
        if (gate.allowed) return [];
        if (gate.key === 'module') return ['Tenant modul listesini kontrol edin veya ilgili modulu aktif edin.'];
        if (gate.key === 'plan') return ['Tenant planini gerekli seviyeye yukseltin.'];
        if (gate.key === 'feature') return ['Plan feature veya tenant feature override ayarini kontrol edin.'];
        if (gate.key === 'permission') return ['Role gerekli module/action iznini ekleyin veya owner kullanici ile deneyin.'];
        return ['Kullanici tenant uyeligini ve aktiflik durumunu kontrol edin.'];
      });

  return {
    summary: blockers.length === 0
      ? `${route?.webAction ?? 'Secilen aksiyon'} icin erisim verildi.`
      : `${route?.webAction ?? 'Secilen aksiyon'} icin ${blockers.length} gate erisimi engelliyor.`,
    blockers,
    nextSteps,
  };
}

export async function simulatePermission(
  tenantId: string,
  input: PermissionSimulationInput,
): Promise<PermissionSimulationResult> {
  const route = input.routeId ? permissionMatrix.find((entry) => entry.id === input.routeId) ?? null : null;
  if (input.routeId && !route) throw new ValidationError('Secilen route matriste bulunamadi.');

  const effectiveModule = route?.module ?? input.module;
  const effectiveAction = route?.action ?? input.action;

  const subject = await loadPermissionSubject(tenantId, input.userId);
  const gates = await buildSimulationGates(tenantId, subject, route, effectiveModule, effectiveAction);
  const explanation = buildExplanation(gates, route);

  return {
    allowed: gates.every((gate) => gate.allowed),
    user: buildUserSummary(subject),
    tenant: { plan: subject.tenant.plan, modules: subject.tenant.modules },
    requested: { module: effectiveModule, action: effectiveAction, route },
    explanation,
    gates,
    matchingRoutes: permissionMatrix.filter((entry) => entry.module === effectiveModule && entry.action === effectiveAction),
  };
}

export async function previewUserScreens(
  tenantId: string,
  input: PermissionScreenPreviewInput,
): Promise<PermissionScreenPreviewResult> {
  const subject = await loadPermissionSubject(tenantId, input.userId);
  const screenRoutes = permissionMatrix.filter((entry) => entry.webHref && entry.action === PermissionAction.READ);
  const screens = await Promise.all(screenRoutes.map(async (route): Promise<PermissionScreenPreviewItem> => {
    const gates = await buildSimulationGates(tenantId, subject, route, route.module, route.action);
    const blockers = gates.filter((gate) => !gate.allowed).map((gate) => `${gate.label}: ${gate.reason}`);
    return {
      routeId: route.id,
      label: route.label,
      href: route.webHref ?? '',
      module: route.module,
      action: route.action,
      webAction: route.webAction,
      minPlan: route.minPlan ?? null,
      featureKey: route.featureKey ?? null,
      allowed: gates.every((gate) => gate.allowed),
      gates,
      blockers,
    };
  }));
  const visibleCount = screens.filter((screen) => screen.allowed).length;

  return {
    user: buildUserSummary(subject),
    tenant: { plan: subject.tenant.plan, modules: subject.tenant.modules },
    summary: {
      visibleCount,
      blockedCount: screens.length - visibleCount,
      totalCount: screens.length,
    },
    screens,
  };
}
