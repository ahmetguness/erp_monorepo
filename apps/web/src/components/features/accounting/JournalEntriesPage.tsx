'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormRow } from '@/components/shared/FormField';
import { useJournalEntries, useCreateJournalEntry, usePostJournalEntry, useLedgerAccounts } from '@/hooks/useAccounting';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { JournalEntry } from '@/services/accounting.service';

const lineSchema = z.object({
  accountId: z.string().min(1, 'Hesap seçiniz'),
  debit: z.string(),
  credit: z.string(),
  description: z.string().optional(),
});

const entrySchema = z.object({
  date: z.string().min(1, 'Tarih zorunludur'),
  description: z.string().optional(),
  lines: z.array(lineSchema).min(2, 'En az 2 satır gereklidir'),
});

type EntryForm = z.infer<typeof entrySchema>;

export function JournalEntriesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useJournalEntries({ page, limit: 20 });
  const createEntry = useCreateJournalEntry();
  const { data: accounts = [] } = useLedgerAccounts();

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      lines: [
        { accountId: '', debit: '0', credit: '0' },
        { accountId: '', debit: '0', credit: '0' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = watch('lines');

  const totalDebit = watchedLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = watchedLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  const onSubmit = (data: EntryForm) => {
    createEntry.mutate(
      {
        date: data.date,
        description: data.description || undefined,
        lines: data.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || undefined,
        })),
      },
      { onSuccess: () => { setCreateOpen(false); reset(); } },
    );
  };

  const columns: ColumnDef<JournalEntry>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'description', header: 'Açıklama', render: (r) => <span className="text-slate-300">{r.description ?? '—'}</span> },
    {
      key: 'isPosted', header: 'Durum', width: '100px', align: 'center',
      render: (r) => <Badge variant={r.isPosted ? 'success' : 'warning'}>{r.isPosted ? 'Onaylı' : 'Taslak'}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Yevmiye Fişleri"
        subtitle="Manuel muhasebe kayıtlarını yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Yeni Fiş</Button>}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Yevmiye fişi bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); }} title="Yeni Yevmiye Fişi" size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={createEntry.isPending} disabled={!isBalanced}>
              {isBalanced ? 'Kaydet' : `Dengesiz (${formatCurrency(Math.abs(totalDebit - totalCredit))})`}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <FormRow cols={2}>
            <Input label="Tarih" required type="date" error={errors.date?.message} {...register('date')} />
            <Input label="Açıklama" placeholder="Fiş açıklaması" {...register('description')} />
          </FormRow>

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase px-1">
              <div className="col-span-5">Hesap</div>
              <div className="col-span-2 text-right">Borç</div>
              <div className="col-span-2 text-right">Alacak</div>
              <div className="col-span-2">Açıklama</div>
              <div className="col-span-1" />
            </div>

            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <Select options={accountOptions} placeholder="Hesap seçin" error={errors.lines?.[idx]?.accountId?.message} {...register(`lines.${idx}.accountId`)} />
                </div>
                <div className="col-span-2">
                  <Input type="number" step="0.01" placeholder="0.00" {...register(`lines.${idx}.debit`)} />
                </div>
                <div className="col-span-2">
                  <Input type="number" step="0.01" placeholder="0.00" {...register(`lines.${idx}.credit`)} />
                </div>
                <div className="col-span-2">
                  <Input placeholder="Açıklama" {...register(`lines.${idx}.description`)} />
                </div>
                <div className="col-span-1 flex justify-end pt-2">
                  {fields.length > 2 && (
                    <button type="button" onClick={() => remove(idx)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <Button type="button" variant="ghost" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ accountId: '', debit: '0', credit: '0' })}>
              Satır Ekle
            </Button>
          </div>

          <div className="flex justify-end gap-8 text-sm pt-2 border-t border-slate-800">
            <div className="text-right"><p className="text-slate-500 text-xs">Toplam Borç</p><p className="text-slate-200 font-medium">{formatCurrency(totalDebit)}</p></div>
            <div className="text-right"><p className="text-slate-500 text-xs">Toplam Alacak</p><p className="text-slate-200 font-medium">{formatCurrency(totalCredit)}</p></div>
            <div className="text-right"><p className="text-slate-500 text-xs">Fark</p><p className={`font-semibold ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(Math.abs(totalDebit - totalCredit))}</p></div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
