'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useRoles } from '@/hooks/useRoles';
import { useCreateSavedView, useDeleteSavedView, useSavedViews } from '@/hooks/useSavedViews';
import type { SavedView, SavedViewScope, SavedViewState } from '@/services/saved-view.service';

interface SavedViewControlsProps {
  module: string;
  listKey: string;
  currentState: SavedViewState;
  onApply: (state: SavedViewState) => void;
}

const SCOPE_OPTIONS: Array<{ value: SavedViewScope; label: string }> = [
  { value: 'PERSONAL', label: 'Kişisel' },
  { value: 'TENANT', label: 'Tenant geneli' },
  { value: 'ROLE', label: 'Rol geneli' },
];

function formatScope(view: SavedView): string {
  if (view.scope === 'TENANT') return 'Tenant';
  if (view.scope === 'ROLE') return 'Rol';
  return 'Kişisel';
}

function parseScope(value: string): SavedViewScope {
  if (value === 'TENANT') return 'TENANT';
  if (value === 'ROLE') return 'ROLE';
  return 'PERSONAL';
}

export function SavedViewControls({ module, listKey, currentState, onApply }: SavedViewControlsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<SavedViewScope>('PERSONAL');
  const [roleId, setRoleId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const defaultAppliedRef = useRef(false);

  const { data: views = [], isLoading } = useSavedViews(listKey);
  const { data: roles } = useRoles({ page: 1, limit: 100 }, { enabled: saveOpen && scope === 'ROLE' });
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView();

  const defaultView = useMemo(() => views.find((view) => view.isDefault), [views]);
  const effectiveSelectedId = selectedId ?? defaultView?.id ?? '';
  const selectedView = useMemo(
    () => views.find((view) => view.id === effectiveSelectedId),
    [effectiveSelectedId, views],
  );

  useEffect(() => {
    if (defaultAppliedRef.current || selectedId !== null) return;
    if (!defaultView) return;
    defaultAppliedRef.current = true;
    onApply(defaultView.state);
  }, [defaultView, onApply, selectedId]);

  const options = useMemo(
    () => [
      { value: '', label: isLoading ? 'Görünümler yükleniyor' : 'Kayıtlı görünümler' },
      ...views.map((view) => ({
        value: view.id,
        label: `${view.name} (${formatScope(view)})`,
      })),
    ],
    [isLoading, views],
  );
  const roleOptions = useMemo(
    () => [
      { value: '', label: 'Rol seç' },
      ...(roles?.data ?? []).map((role) => ({ value: role.id, label: role.name })),
    ],
    [roles],
  );

  const applySelected = (viewId: string) => {
    setSelectedId(viewId);
    const view = views.find((item) => item.id === viewId);
    if (view) onApply(view.state);
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (scope === 'ROLE' && !roleId) return;

    createView.mutate(
      { name: trimmedName, module, listKey, scope, state: currentState, roleId: scope === 'ROLE' ? roleId : undefined, isDefault },
      {
        onSuccess: (view) => {
          setSelectedId(view.id);
          setName('');
          setScope('PERSONAL');
          setRoleId('');
          setIsDefault(false);
          setSaveOpen(false);
        },
      },
    );
  };

  const removeSelected = () => {
    if (!selectedView) return;
    deleteView.mutate(selectedView.id, { onSuccess: () => setSelectedId('') });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        aria-label="Kayıtlı görünümler"
        options={options}
        value={effectiveSelectedId}
        onChange={(event) => applySelected(event.target.value)}
        className="w-56"
      />
      <Button
        type="button"
        variant="secondary"
        size="md"
        leftIcon={<Save className="w-4 h-4" />}
        onClick={() => setSaveOpen(true)}
      >
        Görünümü kaydet
      </Button>
      {selectedView && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          leftIcon={<Trash2 className="w-4 h-4" />}
          onClick={removeSelected}
          loading={deleteView.isPending}
        >
          Sil
        </Button>
      )}

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Görünümü kaydet"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>İptal</Button>
            <Button onClick={submit} loading={createView.isPending} disabled={!name.trim() || (scope === 'ROLE' && !roleId)}>
              Kaydet
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="Görünüm adı"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Örn. Vadesi geçenler"
            prefixIcon={<Bookmark className="w-4 h-4" />}
          />
          <Select
            label="Paylaşım"
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={(event) => {
              setScope(parseScope(event.target.value));
              setRoleId('');
            }}
          />
          {scope === 'ROLE' && (
            <Select
              label="Rol"
              options={roleOptions}
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            />
          )}
          <label className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/35 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
            />
            Varsayılan görünüm yap
          </label>
        </div>
      </Modal>
    </div>
  );
}
