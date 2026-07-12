'use client';

import { useState, useMemo } from 'react';
import { Plus, Shield, Trash2, Lock, Eye, Pencil, Check, X, UserPlus, UserMinus, PlayCircle, MonitorCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  useRoles, useRole, useCreateRole, useUpdateRole, useDeleteRole,
  useAddPermission, useRemovePermission, usePermissionMatrix, usePermissionScreenPreview, useSimulatePermission,
} from '@/hooks/useRoles';
import { useTenantUsers, useUpdateUserRole } from '@/hooks/useUsers';
import { formatDate } from '@/lib/utils';
import type { Role, Permission, PermissionAction, PermissionMatrixEntry, PermissionScreenPreviewItem } from '@/services/role.service';

const MODULES = [
  { key: 'accounting', label: 'Muhasebe' },
  { key: 'inventory', label: 'Stok' },
  { key: 'contacts', label: 'Cari Hesap' },
  { key: 'invoicing', label: 'Fatura' },
  { key: 'reporting', label: 'Raporlama' },
  { key: 'crm', label: 'CRM' },
  { key: 'purchasing', label: 'Satın Alma' },
  { key: 'warehouse', label: 'Depo' },
];

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: 'CREATE', label: 'Oluştur' },
  { key: 'READ', label: 'Oku' },
  { key: 'UPDATE', label: 'Güncelle' },
  { key: 'DELETE', label: 'Sil' },
  { key: 'APPROVE', label: 'Onayla' },
  { key: 'EXPORT', label: 'Dışa Aktar' },
];

function toPermissionAction(value: string): PermissionAction {
  return ACTIONS.find((action) => action.key === value)?.key ?? 'READ';
}

function firstBlocker(screen: PermissionScreenPreviewItem): string {
  return screen.blockers[0] ?? 'Erisim kapali.';
}

const ROLE_MODULES = [
  { key: 'invoicing', label: 'Satis / Fatura' },
  { key: 'accounting', label: 'Muhasebe' },
  { key: 'inventory', label: 'Stok / Urun' },
  { key: 'purchasing', label: 'Satin Alma' },
  { key: 'hr', label: 'Insan Kaynaklari' },
  { key: 'payroll', label: 'Bordro' },
  { key: 'service', label: 'Teknik Servis' },
  { key: 'contacts', label: 'Cari Hesap' },
  { key: 'reporting', label: 'Raporlama' },
  { key: 'approvals', label: 'Onay Akislari' },
  { key: 'tasks', label: 'Gorevler' },
  { key: 'attachments', label: 'Dosyalar' },
  { key: 'mail', label: 'Mail Merkezi' },
  { key: 'notifications', label: 'Bildirimler' },
  { key: 'production', label: 'Uretim' },
  { key: 'marketplace', label: 'Pazaryeri' },
  { key: 'settings', label: 'Ayarlar' },
  { key: 'users', label: 'Kullanicilar' },
  { key: 'roles', label: 'Rol Yonetimi' },
  { key: 'audit_logs', label: 'Denetim Kaydi' },
  { key: 'api_keys', label: 'API Anahtarlari' },
  { key: 'chat', label: 'AI Asistan' },
];

const ROLE_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: 'CREATE', label: 'Olustur' },
  { key: 'READ', label: 'Oku' },
  { key: 'UPDATE', label: 'Guncelle' },
  { key: 'DELETE', label: 'Sil' },
  { key: 'APPROVE', label: 'Onayla' },
  { key: 'EXPORT', label: 'Disa Aktar' },
];

interface RolePreset {
  key: string;
  label: string;
  description: string;
  permissions: Array<{ module: string; action: PermissionAction }>;
}

const READ: PermissionAction = 'READ';
const CREATE: PermissionAction = 'CREATE';
const UPDATE: PermissionAction = 'UPDATE';
const APPROVE: PermissionAction = 'APPROVE';
const EXPORT: PermissionAction = 'EXPORT';

function permissionsFor(modules: readonly string[], actions: readonly PermissionAction[]): Array<{ module: string; action: PermissionAction }> {
  return modules.flatMap((module) => actions.map((action) => ({ module, action })));
}

const ROLE_PRESETS: RolePreset[] = [
  {
    key: 'sales',
    label: 'Satis',
    description: 'Teklif, siparis, cari takip, mail ve gorev odakli satis rolu.',
    permissions: [
      ...permissionsFor(['contacts', 'invoicing', 'mail', 'tasks', 'notifications', 'attachments'], [READ, CREATE, UPDATE]),
      ...permissionsFor(['reporting'], [READ, EXPORT]),
    ],
  },
  {
    key: 'accounting',
    label: 'Muhasebe',
    description: 'Tahsilat, fatura, kasa/banka, rapor ve onay odakli muhasebe rolu.',
    permissions: [
      ...permissionsFor(['accounting', 'invoicing', 'contacts', 'approvals', 'notifications', 'attachments'], [READ, CREATE, UPDATE, EXPORT]),
      ...permissionsFor(['reporting'], [READ, EXPORT]),
      { module: 'approvals', action: APPROVE },
    ],
  },
  {
    key: 'warehouse',
    label: 'Depo',
    description: 'Stok, urun, satin alma ve sayim surecleri icin depo rolu.',
    permissions: [
      ...permissionsFor(['inventory', 'purchasing', 'notifications', 'tasks', 'attachments'], [READ, CREATE, UPDATE]),
      ...permissionsFor(['reporting'], [READ]),
    ],
  },
  {
    key: 'hr',
    label: 'IK',
    description: 'Personel, izin, evrak, bordro okuma ve gorev takip rolu.',
    permissions: [
      ...permissionsFor(['hr', 'tasks', 'notifications', 'attachments', 'mail'], [READ, CREATE, UPDATE]),
      ...permissionsFor(['payroll'], [READ, CREATE, UPDATE, APPROVE, EXPORT]),
      ...permissionsFor(['reporting'], [READ]),
      { module: 'hr', action: APPROVE },
    ],
  },
  {
    key: 'manager',
    label: 'Yonetici',
    description: 'Ciro, karlilik, nakit akisi, raporlar ve onaylar icin yonetici rolu.',
    permissions: [
      ...permissionsFor(['accounting', 'invoicing', 'inventory', 'contacts', 'purchasing', 'service', 'hr', 'payroll', 'reporting', 'approvals', 'notifications', 'tasks', 'attachments', 'mail'], [READ, EXPORT]),
      { module: 'approvals', action: APPROVE },
    ],
  },
];

export function RolesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRoleId, setDetailRoleId] = useState<string | null>(null);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [simUserId, setSimUserId] = useState('');
  const [simRouteId, setSimRouteId] = useState('');
  const [simModule, setSimModule] = useState('invoicing');
  const [simAction, setSimAction] = useState<PermissionAction>('READ');

  const { data, isLoading } = useRoles({ page, limit: 20 });
  const { data: detailRole } = useRole(detailRoleId ?? '');
  const { data: permissionMatrix = [] } = usePermissionMatrix();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const addPerm = useAddPermission();
  const removePerm = useRemovePermission();
  const simulatePerm = useSimulatePermission();
  const { data: allUsers } = useTenantUsers();
  const updateUserRole = useUpdateUserRole();
  const selectedPreset = ROLE_PRESETS.find((preset) => preset.key === selectedPresetKey);
  const activeUsers = useMemo(() => (allUsers ?? []).filter((tenantUser) => tenantUser.isActive && tenantUser.user.isActive), [allUsers]);
  const simulatorUserId = simUserId || activeUsers[0]?.userId || '';
  const selectedSimulatorRoute = permissionMatrix.find((entry) => entry.id === simRouteId);
  const { data: screenPreview, isLoading: screenPreviewLoading } = usePermissionScreenPreview(simulatorUserId);
  const visibleScreens = useMemo(
    () => screenPreview?.screens.filter((screen) => screen.allowed) ?? [],
    [screenPreview],
  );
  const blockedScreens = useMemo(
    () => screenPreview?.screens.filter((screen) => !screen.allowed) ?? [],
    [screenPreview],
  );
  const simulatorModules = useMemo(() => {
    const labels = new Map(ROLE_MODULES.map((module) => [module.key, module.label]));
    permissionMatrix.forEach((entry) => {
      if (!labels.has(entry.module)) labels.set(entry.module, entry.module);
    });
    return Array.from(labels.entries()).map(([key, label]) => ({ key, label }));
  }, [permissionMatrix]);

  const runPermissionSimulation = () => {
    if (!simulatorUserId) return;
    simulatePerm.mutate({
      userId: simulatorUserId,
      module: simModule,
      action: simAction,
      routeId: simRouteId || undefined,
    });
  };

  const selectSimulatorRoute = (routeId: string) => {
    setSimRouteId(routeId);
    const route = permissionMatrix.find((entry) => entry.id === routeId);
    if (!route) return;
    setSimModule(route.module);
    setSimAction(route.action);
  };

  // Permission lookup for detail modal
  const permSet = useMemo(() => {
    const s = new Set<string>();
    detailRole?.permissions?.forEach((p) => s.add(`${p.module}:${p.action}`));
    return s;
  }, [detailRole?.permissions]);

  const findPermission = (module: string, action: string): Permission | undefined =>
    detailRole?.permissions?.find((p) => p.module === module && p.action === action);

  const columns: ColumnDef<Role>[] = [
    {
      key: 'name', header: 'Rol Adı',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            r.isSystem ? 'bg-amber-500/10' : 'bg-sky-500/10'
          }`}>
            <Shield className={`w-3.5 h-3.5 ${r.isSystem ? 'text-amber-400' : 'text-sky-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium text-sm">{r.name}</span>
              {r.isSystem && <Badge variant="warning"><Lock className="w-2.5 h-2.5 mr-0.5" />Sistem</Badge>}
            </div>
            {r.description && <span className="block text-xs text-slate-500 mt-0.5">{r.description}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'permissions', header: 'İzin', width: '80px', align: 'center',
      render: (r) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
          {r.permissions?.length ?? 0}
        </span>
      ),
    },
    {
      key: 'users', header: 'Kullanıcı', width: '90px', align: 'center',
      render: (r) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-xs font-medium text-slate-300">
          {r._count?.users ?? 0}
        </span>
      ),
    },
    {
      key: 'createdAt', header: 'Oluşturma', width: '110px',
      render: (r) => <span className="text-slate-500 text-xs">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions', header: '', width: '120px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDetailRoleId(r.id); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
            aria-label="Detay"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {!r.isSystem && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditRoleId(r.id);
                  setEditForm({ name: r.name, description: r.description ?? '' });
                }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                aria-label="Düzenle"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteRole.mutate(r.id); }}
                className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Rol Yönetimi"
        subtitle="Kullanıcı rollerini ve izinlerini yönetin."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Rol
          </Button>
        }
      />

      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Permission ve plan gating simülasyonu</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Backend route matrisi ile web aksiyonlarını aynı kullanıcı/rol bağlamında kontrol eder.
            </p>
          </div>
          {simulatePerm.data && (
            <Badge variant={simulatePerm.data.allowed ? 'success' : 'danger'} dot>
              {simulatePerm.data.allowed ? 'Erişim var' : 'Erişim yok'}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_1.6fr_1fr_1fr_auto]">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-slate-500">Kullanıcı</span>
            <select
              value={simulatorUserId}
              onChange={(event) => setSimUserId(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-white outline-none focus:border-sky-500/60"
            >
              {!simulatorUserId && <option value="">Kullanıcı seçin</option>}
              {activeUsers.map((tenantUser) => (
                <option key={tenantUser.userId} value={tenantUser.userId}>
                  {tenantUser.user.name} {tenantUser.isOwner ? '(Owner)' : tenantUser.roleRef?.name ? `(${tenantUser.roleRef.name})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-slate-500">Route / UI aksiyonu</span>
            <select
              value={simRouteId}
              onChange={(event) => selectSimulatorRoute(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-white outline-none focus:border-sky-500/60"
            >
              <option value="">Manuel modül + aksiyon</option>
              {permissionMatrix.map((entry: PermissionMatrixEntry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.method} {entry.route} - {entry.webAction}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-slate-500">Modül</span>
            <select
              value={simModule}
              onChange={(event) => { setSimModule(event.target.value); setSimRouteId(''); }}
              disabled={!!selectedSimulatorRoute}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-white outline-none focus:border-sky-500/60 disabled:opacity-60"
            >
              {simulatorModules.map((module) => (
                <option key={module.key} value={module.key}>{module.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-slate-500">Aksiyon</span>
            <select
              value={simAction}
              onChange={(event) => { setSimAction(toPermissionAction(event.target.value)); setSimRouteId(''); }}
              disabled={!!selectedSimulatorRoute}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-white outline-none focus:border-sky-500/60 disabled:opacity-60"
            >
              {ACTIONS.map((action) => (
                <option key={action.key} value={action.key}>{action.label}</option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button
              type="button"
              size="md"
              loading={simulatePerm.isPending}
              disabled={!simulatorUserId}
              onClick={runPermissionSimulation}
              className="w-full whitespace-nowrap"
            >
              <PlayCircle className="h-4 w-4" />
              Test Et
            </Button>
          </div>
        </div>

        {simulatePerm.data && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Simülasyon sonucu</div>
              <div className="mt-2 text-sm text-white">{simulatePerm.data.user.name}</div>
              <div className="text-xs text-slate-500">
                {simulatePerm.data.user.isOwner ? 'Owner' : simulatePerm.data.user.roleName ?? 'Rol yok'} -
                {' '}{simulatePerm.data.requested.module}:{simulatePerm.data.requested.action}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Plan: {simulatePerm.data.tenant.plan}
                {simulatePerm.data.requested.route ? ` - Route: ${simulatePerm.data.requested.route.route}` : ''}
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                <div className="text-xs font-medium text-slate-300">{simulatePerm.data.explanation.summary}</div>
                {simulatePerm.data.explanation.nextSteps.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
                    {simulatePerm.data.explanation.nextSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {simulatePerm.data.gates.map((gate) => (
                <div key={gate.key} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-300">{gate.label}</span>
                    {gate.allowed ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
                  </div>
                  <p className="text-[11px] leading-4 text-slate-500">{gate.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MonitorCheck className="h-4 w-4 text-emerald-400" />
              <div>
                <h4 className="text-xs font-semibold text-white">Ekran gorunurlugu onizlemesi</h4>
                <p className="text-[11px] text-slate-500">
                  Secili kullanicinin plan, modul, feature ve rol izinlerine gore gorebilecegi ekranlar.
                </p>
              </div>
            </div>
            {screenPreview && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="success" dot>{screenPreview.summary.visibleCount} gorunur</Badge>
                <Badge variant="neutral" dot>{screenPreview.summary.blockedCount} kilitli</Badge>
              </div>
            )}
          </div>

          {!simulatorUserId ? (
            <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
              Onizleme icin aktif bir kullanici secin.
            </div>
          ) : screenPreviewLoading ? (
            <div className="rounded-lg border border-slate-800 px-3 py-4 text-xs text-slate-500">
              Ekran onizlemesi yukleniyor...
            </div>
          ) : screenPreview ? (
            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Gorunen ekranlar</div>
                {visibleScreens.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleScreens.slice(0, 8).map((screen) => (
                      <div key={screen.routeId} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-200">{screen.label}</span>
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        </div>
                        <div className="mt-1 truncate text-[11px] text-slate-500">{screen.href}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
                    Bu kullanici icin gorunen ekran bulunmuyor.
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Kilitli ekranlar</div>
                {blockedScreens.length > 0 ? (
                  <div className="space-y-2">
                    {blockedScreens.slice(0, 6).map((screen) => (
                      <div key={screen.routeId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300">{screen.label}</span>
                          <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        </div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-500">{firstBlocker(screen)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-xs text-slate-500">
                    Kilitli ekran yok.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => setDetailRoleId(r.id)}
        emptyTitle="Rol bulunamadı"
        emptyDescription="Yeni bir rol oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      {/* ── Create Role Modal ── */}
      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); setSelectedPresetKey(''); }}
        title="Yeni Rol"
        description="Rol oluşturun, ardından izinleri detay ekranından yönetin."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={createRole.isPending}
              disabled={!form.name.trim()}
              onClick={() => {
                createRole.mutate(
                  { name: form.name, description: form.description || undefined, permissions: selectedPreset?.permissions },
                  { onSuccess: () => { setCreateOpen(false); setSelectedPresetKey(''); setForm({ name: '', description: '' }); } },
                );
              }}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-300">Rol preseti</span>
            <select
              value={selectedPresetKey}
              onChange={(event) => {
                const preset = ROLE_PRESETS.find((item) => item.key === event.target.value);
                setSelectedPresetKey(event.target.value);
                if (preset) setForm({ name: preset.label, description: preset.description });
              }}
              className="h-11 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm text-white outline-none focus:border-sky-500/60"
            >
              <option value="">Custom / bos rol</option>
              {ROLE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Preset sadece baslangic izinlerini doldurur; rol yine ozel roldur ve sonradan degistirilebilir.
            </p>
          </label>
          {selectedPreset && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-slate-400">
              <span className="font-medium text-sky-300">{selectedPreset.permissions.length} izin</span> otomatik eklenecek.
            </div>
          )}
          <Input label="Rol Adı" required placeholder="ör. Depo Sorumlusu" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Açıklama" placeholder="Bu rolün amacı" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Edit Role Modal ── */}
      <Modal
        isOpen={!!editRoleId}
        onClose={() => setEditRoleId(null)}
        title="Rolü Düzenle"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditRoleId(null)}>İptal</Button>
            <Button
              size="sm"
              loading={updateRole.isPending}
              disabled={!editForm.name.trim()}
              onClick={() => {
                if (!editRoleId) return;
                updateRole.mutate(
                  { id: editRoleId, data: { name: editForm.name, description: editForm.description || undefined } },
                  { onSuccess: () => setEditRoleId(null) },
                );
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input label="Rol Adı" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Açıklama" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Role Detail + Permissions Modal ── */}
      <Modal
        isOpen={!!detailRoleId}
        onClose={() => setDetailRoleId(null)}
        title={detailRole?.name ?? 'Rol Detayı'}
        description={detailRole?.description ?? undefined}
        size="lg"
        footer={<Button variant="ghost" size="sm" onClick={() => setDetailRoleId(null)}>Kapat</Button>}
      >
        {detailRole ? (
          <div className="space-y-6">
            {/* Info cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Tip</div>
                <div>{detailRole.isSystem ? <Badge variant="warning">Sistem Rolü</Badge> : <Badge variant="info">Özel Rol</Badge>}</div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">İzin Sayısı</div>
                <div className="text-sm text-white font-medium">{detailRole.permissions?.length ?? 0}</div>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="text-[10px] text-slate-500 mb-1">Kullanıcı Sayısı</div>
                <div className="text-sm text-white font-medium">{detailRole._count?.users ?? 0}</div>
              </div>
            </div>

            {/* Users list + assign */}
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-3">Atanmış Kullanıcılar</h4>
              {detailRole.users && detailRole.users.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                  {detailRole.users.map((tu) => (
                    <div key={tu.user.id} className="flex items-center gap-2 bg-slate-800/30 border border-slate-700/40 rounded-lg px-3 py-2 group">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px] font-bold">
                        {tu.user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs text-white">{tu.user.name}</div>
                        <div className="text-[10px] text-slate-500">{tu.user.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateUserRole.mutate({ userId: tu.user.id, roleId: null })}
                        className="ml-1 p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label="Rolü kaldır"
                      >
                        <UserMinus className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600 mb-3">Bu role atanmış kullanıcı yok.</p>
              )}

              {/* Unassigned users — can be assigned to this role */}
              {(() => {
                const assignedIds = new Set(detailRole.users?.map((tu) => tu.user.id) ?? []);
                const unassigned = (allUsers ?? []).filter(
                  (tu) => tu.isActive && !assignedIds.has(tu.userId) && (!tu.roleId || tu.roleId !== detailRoleId),
                );
                if (unassigned.length === 0) return null;
                return (
                  <div>
                    <div className="text-[10px] text-slate-600 mb-2">Kullanıcı ata:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {unassigned.map((tu) => (
                        <button
                          key={tu.userId}
                          type="button"
                          onClick={() => {
                            if (detailRoleId) updateUserRole.mutate({ userId: tu.userId, roleId: detailRoleId });
                          }}
                          disabled={updateUserRole.isPending}
                          className="flex items-center gap-1.5 bg-slate-800/20 border border-dashed border-slate-700/40 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-sky-400 hover:border-sky-500/30 hover:bg-sky-500/5 transition-colors disabled:opacity-50"
                        >
                          <UserPlus className="w-3 h-3" />
                          {tu.user.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Permission matrix */}
            <div>
              <h4 className="text-xs font-medium text-slate-400 mb-3">
                İzin Matrisi
                {detailRole.isSystem && <span className="text-slate-600 ml-2">(Sistem rolleri düzenlenemez)</span>}
              </h4>
              <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/40">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Modül</th>
                      {ROLE_ACTIONS.map((a) => (
                        <th key={a.key} className="text-center px-2 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_MODULES.map((mod, i) => (
                      <tr key={mod.key} className={i % 2 === 1 ? 'bg-slate-800/[0.08]' : ''}>
                        <td className="px-4 py-2.5 text-sm text-slate-300">{mod.label}</td>
                        {ROLE_ACTIONS.map((act) => {
                          const has = permSet.has(`${mod.key}:${act.key}`);
                          const perm = findPermission(mod.key, act.key);
                          const isToggling = addPerm.isPending || removePerm.isPending;

                          return (
                            <td key={act.key} className="text-center px-2 py-2.5">
                              {detailRole.isSystem ? (
                                // Read-only for system roles
                                <div className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center ${
                                  has ? 'bg-emerald-500/15' : 'bg-slate-800/40'
                                }`}>
                                  {has ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <X className="w-3 h-3 text-slate-700" />
                                  )}
                                </div>
                              ) : (
                                // Clickable for custom roles
                                <button
                                  type="button"
                                  disabled={isToggling}
                                  onClick={() => {
                                    if (!detailRoleId) return;
                                    if (has && perm) {
                                      removePerm.mutate({ roleId: detailRoleId, permissionId: perm.id });
                                    } else {
                                      addPerm.mutate({ roleId: detailRoleId, data: { module: mod.key, action: act.key } });
                                    }
                                  }}
                                  className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 ${
                                    has
                                      ? 'bg-emerald-500/15 hover:bg-red-500/15'
                                      : 'bg-slate-800/40 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  {has ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <X className="w-3 h-3 text-slate-700" />
                                  )}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </Modal>
    </div>
  );
}
