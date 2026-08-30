'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useApproveDocumentDraft, useExtractDocumentDraft } from '@/hooks/useDocumentIntake';

interface DocumentIntakeTarget {
  id: string;
  fileName: string;
}

interface DocumentIntakeModalProps {
  target: DocumentIntakeTarget | null;
  onClose: () => void;
}

export function DocumentIntakeModal({ target, onClose }: DocumentIntakeModalProps) {
  const extractDraft = useExtractDocumentDraft();
  const approveDraft = useApproveDocumentDraft();

  useEffect(() => {
    if (!target) return;
    extractDraft.reset();
    approveDraft.reset();
    extractDraft.mutate(target.id);
    // Mutations are stable for the lifetime of this mounted modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const close = () => {
    extractDraft.reset();
    approveDraft.reset();
    onClose();
  };
  const approve = () => {
    const draft = extractDraft.data;
    if (draft?.status === 'DRAFT_READY') approveDraft.mutate(draft);
  };
  const ready = extractDraft.data?.status === 'DRAFT_READY' ? extractDraft.data : null;

  return (
    <Modal
      isOpen={Boolean(target)}
      onClose={close}
      title="Belgeden ERP taslağı"
      description={target?.fileName}
      size="lg"
      footer={ready ? (
        <>
          <Button variant="ghost" onClick={close}>Vazgeç</Button>
          <Button onClick={approve} loading={approveDraft.isPending} disabled={!ready.suggestion.businessRulesValidation.passed || Boolean(ready.possibleDuplicate)}>
            Onayla ve alış faturası taslağı oluştur
          </Button>
        </>
      ) : undefined}
    >
      {extractDraft.isPending && <p className="text-sm text-slate-400">Belge okunuyor ve tenant kayıtlarıyla eşleştiriliyor…</p>}
      {extractDraft.data?.status === 'PROVIDER_REQUIRED' && (
        <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{extractDraft.data.message}</p>
        </div>
      )}
      {ready && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div><p className="text-sm font-semibold text-slate-200">{ready.suggestion.summary}</p><p className="mt-1 text-xs text-slate-500">Kaynak: {ready.provider}</p></div>
            <Badge variant={ready.suggestion.confidenceScore >= 0.8 ? 'success' : 'warning'}>%{Math.round(ready.suggestion.confidenceScore * 100)} güven</Badge>
          </div>
          {ready.possibleDuplicate && <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Muhtemel tekrar belge: {ready.possibleDuplicate.number}. Taslak oluşturma engellendi.</p></div>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Fatura no', ready.suggestion.draftData.invoiceNumber ?? 'Okunamadı'], ['Cari', ready.suggestion.draftData.contactName ?? 'Eşleşmedi'],
              ['Net', ready.suggestion.draftData.totalNet.toFixed(2)], ['Genel toplam', ready.suggestion.draftData.totalGross.toFixed(2)],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-800 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-xs font-medium text-slate-200">{value}</p></div>)}
          </div>
          <div className="space-y-2">{ready.suggestion.businessRulesValidation.checks.map((check) => <div key={check.rule} className="flex gap-2 text-xs">{check.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />}<span className={check.ok ? 'text-slate-300' : 'text-amber-200'}>{check.message}</span></div>)}</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400">{ready.previewText}</pre>
          {approveDraft.data?.resultId && <Link href={`/dashboard/invoices/${approveDraft.data.resultId}`} className="inline-flex items-center gap-2 text-sm text-emerald-300">Oluşturulan taslağı aç <ExternalLink className="h-4 w-4" /></Link>}
        </div>
      )}
    </Modal>
  );
}
