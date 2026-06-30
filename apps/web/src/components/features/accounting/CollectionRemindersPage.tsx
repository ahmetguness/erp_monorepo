'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Bell, RefreshCw, Trash2, Mail, Phone, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { FormRow } from '@/components/shared/FormField';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { InvoiceSelect, ContactSelect } from '@/components/shared/EntitySelect';
import { useCollectionReminders } from '@/hooks/useCollectionReminders';
import type { CollectionReminder } from '@/services/collection-reminder.service';
import { useInvoices } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';

const reminderFormSchema = z.object({
  invoiceId: z.string().min(1, 'Fatura seçiniz'),
  contactId: z.string().min(1, 'Cari seçiniz'),
  dueDate: z.string().min(1, 'Vade tarihi zorunludur'),
  amount: z.string().min(1, 'Tutar zorunludur').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Tutar sıfırdan büyük olmalıdır',
  ),
  remindAt: z.string().min(1, 'Hatırlatma tarihi zorunludur'),
  notes: z.string().optional(),
});

type ReminderForm = z.infer<typeof reminderFormSchema>;

const STATUS_MAP: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: 'Bekliyor', variant: 'warning' },
  SENT: { label: 'Gönderildi', variant: 'success' },
  FAILED: { label: 'Hata', variant: 'danger' },
};

export function CollectionRemindersPage() {
  const { toast } = useUIStore();
  const { reminders, isLoading, createReminder, updateReminderStatus, deleteReminder } = useCollectionReminders();
  const { data: invoicesData } = useInvoices({ page: 1, limit: 100 });
  const invoices = invoicesData?.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ReminderForm>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: {
      invoiceId: '',
      contactId: '',
      dueDate: '',
      amount: '',
      remindAt: '',
      notes: '',
    },
  });

  const watchInvoiceId = watch('invoiceId');
  const selectedInvoice = invoices.find((inv) => inv.id === watchInvoiceId);

  // Automatically fill fields when invoice changes
  const handleInvoiceChange = (invoiceId: string) => {
    setValue('invoiceId', invoiceId, { shouldValidate: true, shouldDirty: true });
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      setValue('contactId', inv.contactId, { shouldValidate: true });
      setValue('dueDate', inv.dueDate ? inv.dueDate.split('T')[0] : '');
      setValue('amount', String(inv.totalGross), { shouldValidate: true });
      
      // Default remindAt to 3 days before dueDate
      if (inv.dueDate) {
        const due = new Date(inv.dueDate);
        due.setDate(due.getDate() - 3);
        const remindDateStr = due.toISOString().split('T')[0];
        setValue('remindAt', remindDateStr);
      }
    }
  };

  const onSubmit = (data: ReminderForm) => {
    createReminder.mutate({
      invoiceId: data.invoiceId,
      contactId: data.contactId,
      dueDate: data.dueDate,
      amount: Number(data.amount),
      remindAt: data.remindAt,
      notes: data.notes || undefined,
    }, {
      onSuccess: () => {
        toast.success('Tahsilat hatırlatıcı başarıyla oluşturuldu.');
        setCreateOpen(false);
        reset();
      },
      onError: (err) => {
        toast.error(getErrorMessage(err));
      },
    });
  };

  const columns: ColumnDef<CollectionReminder>[] = [
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200 font-medium">{r.contact?.name}</span> },
    { key: 'invoice', header: 'Fatura No', width: '120px', render: (r) => <span className="font-mono text-slate-400 text-xs">{r.invoice?.number}</span> },
    { key: 'amount', header: 'Tutar', width: '130px', align: 'right', render: (r) => <span className="font-mono font-bold text-white">{formatCurrency(r.amount)}</span> },
    { key: 'dueDate', header: 'Vade Tarihi', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.dueDate)}</span> },
    { key: 'remindAt', header: 'Hatırlatma', width: '100px', render: (r) => <span className="text-sky-400 text-xs font-medium">{formatDate(r.remindAt)}</span> },
    {
      key: 'status',
      header: 'Durum',
      width: '100px',
      align: 'center',
      render: (r) => {
        const s = STATUS_MAP[r.status];
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>;
      },
    },
    {
      key: 'channels',
      header: 'Kanallar',
      width: '120px',
      render: (r) => (
        <div className="flex gap-2">
          <Badge variant={r.emailSent ? 'success' : 'neutral'} className="gap-1 text-[10px]">
            <Mail className="w-3 h-3" /> E-Posta
          </Badge>
          <Badge variant={r.smsSent ? 'success' : 'neutral'} className="gap-1 text-[10px]">
            <Phone className="w-3 h-3" /> SMS
          </Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== 'SENT' && (
            <button
              onClick={() => updateReminderStatus.mutate({ id: r.id, status: 'SENT' })}
              className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title="Şimdi Gönder"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => deleteReminder.mutate(r.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tahsilat Hatırlatıcıları"
        subtitle="Vadesi gelen veya yaklaşan faturalar için hatırlatma bildirimleri."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            Yeni Hatırlatıcı
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={reminders}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Henüz hatırlatma kurulmamış"
        emptyDescription="Yaklaşan ödemeler için e-posta/sms hatırlatıcıları ekleyerek nakit akışınızı koruyun."
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Tahsilat Hatırlatıcı"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={createReminder.isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <InvoiceSelect
            label="Fatura"
            required
            value={watchInvoiceId}
            onChange={handleInvoiceChange}
            error={errors.invoiceId?.message}
          />
          {selectedInvoice ? (
            <Input
              label="Cari"
              value={selectedInvoice.contact?.name ?? ''}
              readOnly
              disabled
            />
          ) : (
            <ContactSelect
              label="Cari"
              required
              value={watch('contactId')}
              onChange={(val) => setValue('contactId', val, { shouldValidate: true })}
              error={errors.contactId?.message}
            />
          )}
          <FormRow cols={2}>
            <DatePicker
              label="Vade Tarihi"
              required
              value={watch('dueDate')}
              onValueChange={(val) => setValue('dueDate', val ?? '')}
              error={errors.dueDate?.message}
              disabled
            />
            <Input
              label="Fatura Tutarı"
              required
              type="number"
              value={watch('amount')}
              {...register('amount')}
              error={errors.amount?.message}
              disabled
            />
          </FormRow>
          <DatePicker
            label="Hatırlatma Gönderim Tarihi"
            required
            value={watch('remindAt')}
            onValueChange={(val) => setValue('remindAt', val ?? '')}
            error={errors.remindAt?.message}
          />
          <Textarea
            label="Notlar"
            placeholder="Hatırlatıcıya özel notlar (örn: aramada konuşulanlar)..."
            {...register('notes')}
          />
        </form>
      </Modal>
    </div>
  );
}
