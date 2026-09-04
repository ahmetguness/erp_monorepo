'use client';

import type React from 'react';
import { Archive, Download, ListTodo, Mail, Tags, ToggleRight } from 'lucide-react';
import type { BulkActionDefinition, BulkPermissionAction } from './BulkActionBar';

export type BulkActionPresetKind = 'export' | 'mail' | 'tag' | 'status' | 'task' | 'archive';

interface BulkActionPresetConfig {
  module: string;
  entityName: string;
  notify: (message: string) => void;
  include: readonly BulkActionPresetKind[];
}

interface BulkActionPresetTemplate {
  label: string;
  icon: React.ReactNode;
  permission: (module: string) => { module: string; action: BulkPermissionAction };
  message: (count: number, entityName: string) => string;
}

const PRESET_TEMPLATES: Record<BulkActionPresetKind, BulkActionPresetTemplate> = {
  export: {
    label: 'Dışa aktar',
    icon: <Download className="h-3.5 w-3.5" />,
    permission: (module) => ({ module, action: 'EXPORT' }),
    message: (count, entityName) => `${count} ${entityName} için dışa aktarım işi hazır.`,
  },
  mail: {
    label: 'Toplu mail',
    icon: <Mail className="h-3.5 w-3.5" />,
    permission: () => ({ module: 'mail', action: 'CREATE' }),
    message: (count, entityName) => `${count} ${entityName} için toplu mail akışı hazır.`,
  },
  tag: {
    label: 'Etiketle',
    icon: <Tags className="h-3.5 w-3.5" />,
    permission: (module) => ({ module, action: 'UPDATE' }),
    message: (count, entityName) => `${count} ${entityName} için etiketleme işi hazır.`,
  },
  status: {
    label: 'Durum değiştir',
    icon: <ToggleRight className="h-3.5 w-3.5" />,
    permission: (module) => ({ module, action: 'UPDATE' }),
    message: (count, entityName) => `${count} ${entityName} için durum degistirme işi hazır.`,
  },
  task: {
    label: 'Görev oluştur',
    icon: <ListTodo className="h-3.5 w-3.5" />,
    permission: () => ({ module: 'tasks', action: 'CREATE' }),
    message: (count, entityName) => `${count} ${entityName} için görev oluşturma işi hazır.`,
  },
  archive: {
    label: 'Arsivle',
    icon: <Archive className="h-3.5 w-3.5" />,
    permission: (module) => ({ module, action: 'UPDATE' }),
    message: (count, entityName) => `${count} ${entityName} için arsivleme işi hazır.`,
  },
};

export function createBulkActionPresets({
  module,
  entityName,
  notify,
  include,
}: BulkActionPresetConfig): BulkActionDefinition[] {
  return include.map((kind) => {
    const template = PRESET_TEMPLATES[kind];
    return {
      id: kind,
      label: template.label,
      icon: template.icon,
      permission: template.permission(module),
      executionMode: 'job',
      onRun: ({ selectedIds }) => {
        notify(template.message(selectedIds.length, entityName));
      },
    };
  });
}
