import { EntityType, NotificationStatus, Plan, Prisma, PrismaClient, Priority, TaskType } from '@prisma/client';
import {
  PLAN_FEATURE_DEFINITIONS,
  PLAN_FEATURES,
  PLAN_MODULES,
  type ModuleKey,
  type PlanFeatureFlags,
  type PlanName,
} from '@repo/types/plans';
import { createTask } from './task.service.js';

type DbClient = PrismaClient | Prisma.TransactionClient;
type BooleanFeatureFlag = {
  [Key in keyof PlanFeatureFlags]: PlanFeatureFlags[Key] extends boolean ? Key : never;
}[keyof PlanFeatureFlags];

interface PlanChangeExperienceInput {
  tenantId: string;
  oldPlan: Plan;
  newPlan: Plan;
  changedByUserId?: string | null;
}

interface NamedChange {
  label: string;
}

interface FeatureChange extends NamedChange {
  flag: BooleanFeatureFlag;
}

interface ModuleChange extends NamedChange {
  module: ModuleKey;
}

interface PlanChangeDiff {
  openedFeatures: FeatureChange[];
  closedFeatures: FeatureChange[];
  openedModules: ModuleChange[];
  closedModules: ModuleChange[];
}

interface OnboardingItem {
  key: string;
  title: string;
  detail: string;
  href: string;
  module: string;
  priority: Priority;
}

const FEATURE_LABELS: Record<BooleanFeatureFlag, string> = {
  multiWarehouse: 'Coklu depo',
  roleManagement: 'Rol yonetimi',
  approvals: 'Onay akislari',
  crm: 'CRM',
  sales: 'Satis',
  purchasing: 'Satin alma',
  production: 'Uretim',
  service: 'Teknik servis',
  marketplace: 'Pazaryeri entegrasyonlari',
  payroll: 'Bordro',
  hr: 'Insan kaynaklari',
  apiAccess: 'API erisimi',
  advancedAuditLog: 'Gelismis audit log',
  customReporting: 'Ozel raporlama',
  documentCenter: 'Dokuman merkezi',
  smartNotifications: 'Akilli bildirimler',
  workflowCenter: 'Is akisi merkezi',
  mailCenter: 'Mail merkezi',
  bulkOperations: 'Toplu islemler',
  cashflowForecast: 'Nakit akisi tahmini',
  bankReconciliation: 'Banka mutabakati',
  lotSerialTracking: 'Lot / seri no takibi',
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  accounting: 'Muhasebe',
  inventory: 'Stok ve depo',
  contacts: 'Cari hesaplar',
  invoicing: 'Fatura',
  reporting: 'Raporlama',
  purchasing: 'Satin alma',
  production: 'Uretim',
  service: 'Teknik servis',
  marketplace: 'Pazaryeri',
  payroll: 'Bordro',
  hr: 'Insan kaynaklari',
  approvals: 'Onay akislari',
  warehouse: 'Depo yonetimi',
  mail: 'Mail',
  workflow: 'Is akisi',
  documents: 'Dokumanlar',
};

const ONBOARDING_BY_FEATURE: Partial<Record<BooleanFeatureFlag, OnboardingItem>> = {
  roleManagement: { key: 'role-management', title: 'Rol ve yetkileri gozden gecirin', detail: 'Yeni plan rol yonetimini acti. Ekip rollerini olusturup hassas moduller icin yetkileri sinirlayin.', href: '/dashboard/roles', module: 'roles', priority: Priority.HIGH },
  approvals: { key: 'approvals', title: 'Ilk onay akislarini tanimlayin', detail: 'Teklif, satin alma veya odeme gibi kritik surecler icin onay akislarini kurun.', href: '/dashboard/approvals', module: 'approvals', priority: Priority.HIGH },
  apiAccess: { key: 'api-access', title: 'API anahtari politikasini hazirlayin', detail: 'Entegrasyonlar icin scope ve IP allowlist kurallariyla ilk API anahtarinizi olusturun.', href: '/dashboard/api-keys', module: 'api_keys', priority: Priority.MEDIUM },
  workflowCenter: { key: 'workflow-center', title: 'Is akisi merkezini kurun', detail: 'Tekrarlayan operasyonlar icin gorev ve bildirim otomasyonlarini tanimlayin.', href: '/dashboard/workflow', module: 'workflow', priority: Priority.MEDIUM },
  bulkOperations: { key: 'bulk-operations', title: 'Toplu islem kontrollerini planlayin', detail: 'Toplu guncelleme ve operasyonlar icin test listesi ve sorumlu kisileri belirleyin.', href: '/dashboard/bulk-operations', module: 'operations', priority: Priority.MEDIUM },
  bankReconciliation: { key: 'bank-reconciliation', title: 'Banka mutabakat akisini baslatin', detail: 'Banka hareketleri ve mutabakat ekranlarini muhasebe surecinize baglayin.', href: '/dashboard/reconciliations', module: 'accounting', priority: Priority.MEDIUM },
  lotSerialTracking: { key: 'lot-serial-tracking', title: 'Lot / seri no kurallarini tanimlayin', detail: 'Izlenebilir urunler icin lot ve seri no operasyon kurallarini netlestirin.', href: '/dashboard/lot-serials', module: 'inventory', priority: Priority.MEDIUM },
  production: { key: 'production', title: 'Uretim modulu ilk kurulumunu yapin', detail: 'Is merkezleri, BOM ve kapasite planlama ayarlarini uretim ekibiyle hazirlayin.', href: '/dashboard/production/advanced', module: 'production', priority: Priority.HIGH },
  service: { key: 'service', title: 'Servis operasyonlarini kurun', detail: 'Bakim, saha servis ve musteri varligi akisini servis ekibiyle devreye alin.', href: '/dashboard/service/advanced', module: 'service', priority: Priority.HIGH },
  marketplace: { key: 'marketplace', title: 'Pazaryeri entegrasyonlarini baglayin', detail: 'Kanallari, siparis senkronizasyonunu ve hata takip sorumlularini belirleyin.', href: '/dashboard/marketplace/integrations', module: 'marketplace', priority: Priority.MEDIUM },
  hr: { key: 'hr', title: 'IK veri setini tamamlayin', detail: 'Personel kayitlari, izin akislari ve evrak kontrolleri icin ilk kurulumu yapin.', href: '/dashboard/hr/advanced', module: 'hr', priority: Priority.MEDIUM },
  payroll: { key: 'payroll', title: 'Bordro kapanis kontrollerini hazirlayin', detail: 'Donemsel bordro kontrolleri ve yetki sinirlarini IK/muhasebe ekibiyle netlestirin.', href: '/dashboard/hr/payroll', module: 'payroll', priority: Priority.HIGH },
  mailCenter: { key: 'mail-center', title: 'Mail merkezini yapilandirin', detail: 'Gonderici ayarlari, sablonlar ve ekip erisimlerini kontrol edin.', href: '/dashboard/mail', module: 'mail', priority: Priority.MEDIUM },
};

export class PlanChangeExperienceService {
  constructor(private readonly db: DbClient) {}

  async handlePlanChanged(input: PlanChangeExperienceInput): Promise<PlanChangeDiff> {
    const oldPlan = toPlanName(input.oldPlan);
    const newPlan = toPlanName(input.newPlan);
    const diff = buildPlanChangeDiff(oldPlan, newPlan);

    if (oldPlan === newPlan) return diff;

    const owners = await this.db.tenantUser.findMany({
      where: { tenantId: input.tenantId, isOwner: true, isActive: true },
      select: { userId: true },
    });

    if (owners.length > 0) {
      await this.db.notification.createMany({
        data: owners.map((owner) => ({
          tenantId: input.tenantId,
          userId: owner.userId,
          title: 'Plan degisikligi tamamlandi',
          message: buildNotificationMessage(oldPlan, newPlan, diff),
          module: 'admin',
          entityType: EntityType.OTHER,
          entityId: input.tenantId,
          status: NotificationStatus.UNREAD,
        })),
      });
    }

    await this.createOnboardingTasks(input, diff);
    return diff;
  }

  private async createOnboardingTasks(input: PlanChangeExperienceInput, diff: PlanChangeDiff): Promise<void> {
    const items = diff.openedFeatures
      .map((feature) => ONBOARDING_BY_FEATURE[feature.flag])
      .filter((item): item is OnboardingItem => item !== undefined);

    await Promise.all(items.map((item) => createTask(input.tenantId, {
      title: item.title,
      detail: item.detail,
      type: TaskType.GENERAL,
      priority: item.priority,
      module: item.module,
      entityType: EntityType.OTHER,
      entityId: input.tenantId,
      href: item.href,
      source: `plan-onboarding:${input.newPlan}:${item.key}`,
      createdById: input.changedByUserId ?? null,
      dueAt: dueInDays(7),
    }, this.db)));
  }
}

function buildPlanChangeDiff(oldPlan: PlanName, newPlan: PlanName): PlanChangeDiff {
  const oldFeatures = PLAN_FEATURES[oldPlan];
  const newFeatures = PLAN_FEATURES[newPlan];
  const booleanFlags = PLAN_FEATURE_DEFINITIONS
    .map((definition) => definition.flag)
    .filter((flag): flag is BooleanFeatureFlag => typeof oldFeatures[flag] === 'boolean' && typeof newFeatures[flag] === 'boolean');

  return {
    openedFeatures: booleanFlags
      .filter((flag) => oldFeatures[flag] === false && newFeatures[flag] === true)
      .map((flag) => ({ flag, label: FEATURE_LABELS[flag] })),
    closedFeatures: booleanFlags
      .filter((flag) => oldFeatures[flag] === true && newFeatures[flag] === false)
      .map((flag) => ({ flag, label: FEATURE_LABELS[flag] })),
    openedModules: diffModules(PLAN_MODULES[oldPlan], PLAN_MODULES[newPlan]),
    closedModules: diffModules(PLAN_MODULES[newPlan], PLAN_MODULES[oldPlan]),
  };
}

function diffModules(previousModules: readonly ModuleKey[], nextModules: readonly ModuleKey[]): ModuleChange[] {
  const previous = new Set(previousModules);
  return nextModules.filter((module) => !previous.has(module)).map((module) => ({ module, label: MODULE_LABELS[module] }));
}

function buildNotificationMessage(oldPlan: PlanName, newPlan: PlanName, diff: PlanChangeDiff): string {
  return [
    `Plan: ${oldPlan} -> ${newPlan}`,
    `Acilan ozellikler: ${formatChangeLabels(diff.openedFeatures)}`,
    `Kapanan ozellikler: ${formatChangeLabels(diff.closedFeatures)}`,
    `Acilan moduller: ${formatChangeLabels(diff.openedModules)}`,
    `Kapanan moduller: ${formatChangeLabels(diff.closedModules)}`,
    'Onboarding checklist dashboard gorevlerinize eklendi.',
  ].join('\n');
}

function formatChangeLabels(items: readonly NamedChange[]): string {
  return items.length > 0 ? items.map((item) => item.label).join(', ') : 'Yok';
}

function toPlanName(plan: Plan): PlanName {
  switch (plan) {
    case Plan.STARTER:
      return 'STARTER';
    case Plan.PROFESSIONAL:
      return 'PROFESSIONAL';
    case Plan.ENTERPRISE:
      return 'ENTERPRISE';
  }
}

function dueInDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}
