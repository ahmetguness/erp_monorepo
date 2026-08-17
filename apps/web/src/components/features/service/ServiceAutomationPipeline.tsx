'use client';

import { useState } from 'react';
import {
  Wrench,
  UserCheck,
  PackageCheck,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import {
  useAssignServiceTechnician,
  useReserveServiceParts,
  useCompleteServiceAndGenerateInvoice,
} from '@/hooks/useServiceAutomation';
import { cn } from '@/lib/utils';

interface ServiceAutomationPipelineProps {
  serviceRequestId: string;
  serviceNumber: string;
  status: string;
  assignedToId?: string | null;
  itemsCount: number;
}

export function ServiceAutomationPipeline({
  serviceRequestId,
  serviceNumber,
  status,
  assignedToId,
  itemsCount,
}: ServiceAutomationPipelineProps) {
  const [technicianIdInput, setTechnicianIdInput] = useState('');
  const [warehouseIdInput, setWarehouseIdInput] = useState('');

  const assignMutation = useAssignServiceTechnician();
  const reserveMutation = useReserveServiceParts();
  const completeMutation = useCompleteServiceAndGenerateInvoice();

  const isCompleted = status === 'COMPLETED';
  const isWaitingParts = status === 'WAITING_PARTS';
  const isInProgress = status === 'IN_PROGRESS';

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-5">
      {/* Header Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Servis Otomasyon Boru Hattı</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-white">Servis Talebi #{serviceNumber} Otomasyonu</h3>
          </div>
        </div>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-extrabold border',
            isCompleted
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-sky-500/10 text-sky-400 border-sky-500/20',
          )}
        >
          {status}
        </span>
      </div>

      {/* Step Pipeline Visualization */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 relative">
        {/* Step 1: Created / Assignment */}
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs space-y-2 transition-all',
            assignedToId
              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
              : 'bg-slate-950/60 border-slate-800 text-slate-300',
          )}
        >
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-sky-400" />
              1. Teknisyen Atama
            </span>
            {assignedToId ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <span className="text-[10px] text-amber-400">Bekliyor</span>}
          </div>
          <p className="text-[11px] text-slate-400">Servise sorumlu teknisyen ataması yapılır.</p>
          {!assignedToId && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Teknisyen ID..."
                value={technicianIdInput}
                onChange={(e) => setTechnicianIdInput(e.target.value)}
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-[11px]"
              />
              <button
                onClick={() => assignMutation.mutate({ id: serviceRequestId, technicianId: technicianIdInput || 'TECH-001' })}
                disabled={assignMutation.isPending}
                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold shrink-0 disabled:opacity-50"
              >
                {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ata'}
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Parts Reservation */}
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs space-y-2 transition-all',
            isWaitingParts || isInProgress || isCompleted
              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
              : 'bg-slate-950/60 border-slate-800 text-slate-300',
          )}
        >
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-purple-400" />
              2. Parça Rezervasyonu
            </span>
            {isWaitingParts || isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <span className="text-[10px] text-amber-400">{itemsCount} Parça</span>}
          </div>
          <p className="text-[11px] text-slate-400">Yedek parçalar depodan rezerve edilir.</p>
          {!isCompleted && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Depo ID..."
                value={warehouseIdInput}
                onChange={(e) => setWarehouseIdInput(e.target.value)}
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-[11px]"
              />
              <button
                onClick={() => reserveMutation.mutate({ id: serviceRequestId, warehouseId: warehouseIdInput || 'WH-MAIN' })}
                disabled={reserveMutation.isPending}
                className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold shrink-0 disabled:opacity-50"
              >
                {reserveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Rezerve Et'}
              </button>
            </div>
          )}
        </div>

        {/* Step 3 & 4: Completion & Auto Invoice */}
        <div
          className={cn(
            'p-3.5 rounded-xl border text-xs space-y-2 col-span-1 sm:col-span-2 transition-all',
            isCompleted
              ? 'bg-emerald-950/30 border-emerald-600/50 text-emerald-200'
              : 'bg-slate-950/60 border-slate-800 text-slate-300',
          )}
        >
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              3 & 4. Tamamlama & Otomatik Faturatör + E-Belge
            </span>
            {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </div>
          <p className="text-[11px] text-slate-400">
            Servis tamamlandığında stoklar düşer, müşteri carisine otomatik Fatura Taslağı & E-Belge üretilir.
          </p>

          {!isCompleted && (
            <button
              onClick={() => completeMutation.mutate({ id: serviceRequestId, warehouseId: warehouseIdInput || undefined })}
              disabled={completeMutation.isPending}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 mt-1"
            >
              {completeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Servisi Tamamla & Otomatik Fatura Üret</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
