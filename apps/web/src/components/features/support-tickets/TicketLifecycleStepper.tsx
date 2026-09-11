'use client';

import { Check, Clock, AlertCircle, CheckCircle2, Archive } from 'lucide-react';
import type { PlatformTicketStatus } from '@repo/types';

interface TicketLifecycleStepperProps {
  status: PlatformTicketStatus;
  createdAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
}

export function TicketLifecycleStepper({
  status,
  createdAt,
  resolvedAt,
  closedAt,
}: TicketLifecycleStepperProps) {
  const steps = [
    {
      id: 'OPEN',
      label: 'Talep Alındı',
      desc: 'Kuyrukta bekliyor',
      icon: Clock,
      isActive: true,
      isCompleted: status !== 'OPEN',
    },
    {
      id: 'IN_PROGRESS',
      label: 'İnceleniyor',
      desc: 'Uzman atandı',
      icon: Clock,
      isActive: status === 'IN_PROGRESS' || status === 'WAITING_TENANT',
      isCompleted: status === 'RESOLVED' || status === 'CLOSED',
    },
    {
      id: 'WAITING_TENANT',
      label: status === 'WAITING_TENANT' ? 'Yanıtınız Bekleniyor' : 'İletişim & Analiz',
      desc: status === 'WAITING_TENANT' ? 'Sizden teyit bekleniyor' : 'Karşılıklı bilgi alışverişi',
      icon: AlertCircle,
      isActive: status === 'WAITING_TENANT',
      isCompleted: status === 'RESOLVED' || status === 'CLOSED',
      highlight: status === 'WAITING_TENANT',
    },
    {
      id: 'RESOLVED',
      label: 'Çözümlendi',
      desc: resolvedAt ? 'Çözüm sağlandı' : 'Hedef aşama',
      icon: CheckCircle2,
      isActive: status === 'RESOLVED',
      isCompleted: status === 'RESOLVED' || status === 'CLOSED',
    },
  ];

  if (status === 'CLOSED') {
    steps.push({
      id: 'CLOSED',
      label: 'Kapatıldı',
      desc: closedAt ? 'Arşivlendi' : 'İşlem tamam',
      icon: Archive,
      isActive: true,
      isCompleted: true,
      highlight: false,
    });
  }

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCurrent = (step.id === status);

          return (
            <div key={step.id} className="flex items-center gap-3 w-full sm:w-auto flex-1">
              <div className="flex items-center gap-3">
                <div
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isCurrent
                      ? step.highlight
                        ? 'border-rose-500 bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/30'
                        : 'border-sky-500 bg-sky-500/20 text-sky-400 ring-2 ring-sky-500/30'
                      : step.isCompleted
                      ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-400'
                      : 'border-slate-800 bg-slate-800/60 text-slate-500'
                  }`}
                >
                  {step.isCompleted && !isCurrent ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  {isCurrent && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-ping ${
                        step.highlight ? 'bg-rose-400' : 'bg-sky-400'
                      }`}
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold leading-tight truncate ${
                      isCurrent
                        ? step.highlight
                          ? 'text-rose-400'
                          : 'text-sky-300'
                        : step.isCompleted
                        ? 'text-slate-200'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">{step.desc}</p>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden sm:block flex-1 h-[2px] mx-2 bg-slate-800">
                  <div
                    className={`h-full transition-all ${
                      step.isCompleted ? 'bg-emerald-500/40' : 'bg-transparent'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
