'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { useBankAccounts } from '@/hooks/useAccounting';
import { commitOpeningBalances, previewOpeningBalances, type OpeningBalancePreview } from '@/services/opening-balance.service';
import { buildOpeningBalanceInput } from './parse-opening-balance-csv';

const CONTACT_SAMPLE = 'contactCode,debit,credit,description\nCAR-001,1000,0,Açılış alacağı';
const BANK_SAMPLE = 'bankAccountId,balance,description\nBANK_ACCOUNT_ID,2500,Açılış banka bakiyesi';
const LEDGER_SAMPLE = 'accountCode,debit,credit,description\n100,3500,0,Açılış varlıkları\n500,0,3500,Açılış karşılığı';

export function OpeningBalancesPanel() {
  const [openingDate, setOpeningDate] = useState('');
  const [reference, setReference] = useState('DEVIR');
  const [contactsCsv, setContactsCsv] = useState(CONTACT_SAMPLE);
  const [banksCsv, setBanksCsv] = useState(BANK_SAMPLE);
  const [ledgerCsv, setLedgerCsv] = useState(LEDGER_SAMPLE);
  const [preview, setPreview] = useState<OpeningBalancePreview | null>(null);
  const { toast } = useUIStore();
  const queryClient = useQueryClient();
  const { data: bankAccounts = [] } = useBankAccounts();
  const payload = () => buildOpeningBalanceInput({ openingDate, reference, contactsCsv, banksCsv, ledgerCsv });
  const previewMutation = useMutation({ mutationFn: previewOpeningBalances, onSuccess: setPreview, onError: (error: unknown) => toast.error(getErrorMessage(error)) });
  const commitMutation = useMutation({
    mutationFn: commitOpeningBalances,
    onSuccess: (result) => {
      toast.success(`${result.journalEntryNumber} açılış fişi ve bağlı bakiyeler kaydedildi.`);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
  const run = (kind: 'preview' | 'commit') => {
    try {
      const input = payload();
      if (kind === 'preview') previewMutation.mutate(input);
      else commitMutation.mutate(input);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  const csvFields: Array<{ label: string; value: string; setter: Dispatch<SetStateAction<string>> }> = [
    { label: 'Cari bakiyeler', value: contactsCsv, setter: setContactsCsv },
    { label: 'Banka bakiyeleri', value: banksCsv, setter: setBanksCsv },
    { label: 'Muhasebe fişi', value: ledgerCsv, setter: setLedgerCsv },
  ];

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Landmark className="h-4 w-4 text-sky-300" />Açılış bakiyeleri</h2><p className="mt-1 text-xs text-slate-500">Cari, banka ve dengeli muhasebe açılışını tek transaction ile kesinleştirin.</p></div>
        <div className="flex gap-2"><Button variant="outline" loading={previewMutation.isPending} onClick={() => run('preview')}>Ön kontrol</Button><Button disabled={!preview?.valid || preview.replayed} loading={commitMutation.isPending} onClick={() => run('commit')}>Kesinleştir</Button></div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2"><Input label="Açılış tarihi" type="date" value={openingDate} onChange={(event) => { setOpeningDate(event.target.value); setPreview(null); }} /><Input label="Referans" value={reference} onChange={(event) => { setReference(event.target.value); setPreview(null); }} /></div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {csvFields.map(({ label, value, setter }) => (
          <label key={label} className="space-y-1"><span className="text-xs font-medium text-slate-300">{label}</span><textarea className="h-36 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200" value={value} onChange={(event) => { setter(event.target.value); setPreview(null); }} /></label>
        ))}
      </div>
      {bankAccounts.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          Banka hesapları: {bankAccounts.map((account) => `${account.name} = ${account.id}`).join(' · ')}
        </p>
      )}
      {preview && <div className={`mt-3 rounded-lg border p-3 text-xs ${preview.valid ? 'border-emerald-500/30 text-emerald-200' : 'border-amber-500/30 text-amber-200'}`}>
        <p className="flex items-center gap-2 font-semibold">{preview.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{preview.valid ? 'Açılış paketi hazır.' : `${preview.issues.length} doğrulama sorunu var.`}</p>
        <p className="mt-1">Kapalı önceki dönem: {preview.closedPriorPeriod?.name ?? 'Bulunamadı'} · Fiş: {preview.totals.ledgerDebit.toFixed(2)} / {preview.totals.ledgerCredit.toFixed(2)}</p>
        {preview.issues.map((issue, index) => <p key={`${issue.scope}-${issue.row}-${index}`} className="mt-1">{issue.scope}{issue.row ? ` #${issue.row}` : ''}: {issue.message}</p>)}
      </div>}
    </section>
  );
}
