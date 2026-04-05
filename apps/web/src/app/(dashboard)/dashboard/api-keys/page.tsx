'use client';

import { useState } from 'react';
import { Key, Play } from 'lucide-react';
import { ApiKeysPage } from '@/components/features/professional/ApiKeysPage';
import { ApiPlayground } from '@/components/features/professional/ApiPlayground';
import { FeatureGate } from '@/components/shared/FeatureGate';

function ApiKeysWithPlayground() {
  const [tab, setTab] = useState<'keys' | 'playground'>('keys');

  const tabs = [
    { id: 'keys' as const, label: 'API Anahtarları', icon: Key },
    { id: 'playground' as const, label: 'Playground', icon: Play },
  ];

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 bg-slate-900/50 border border-slate-800/60 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'keys' && <ApiKeysPage />}
      {tab === 'playground' && <ApiPlayground />}
    </div>
  );
}

export default function Page() {
  return (
    <FeatureGate feature="apiAccess" plan="PROFESSIONAL">
      <ApiKeysWithPlayground />
    </FeatureGate>
  );
}
