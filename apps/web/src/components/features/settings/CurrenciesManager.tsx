'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { FormRow } from '@/components/shared/FormField';
import { useCurrencies, useCreateCurrency } from '@/hooks/useMasterData';
import type { Currency } from '@/services/master-data.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const currencySchema = z.object({
  code: z.string().min(1, 'Kod zorunludur').max(5).toUpperCase(),
  name: z.string().min(1, 'Ad zorunludur'),
  symbol: z.string().min(1, 'Sembol zorunludur').max(5),
  defaultRate: z.string().min(1, 'Kur zorunludur').refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0,
    'Geçerli bir kur girin',
  ),
});

type CurrencyForm = z.infer<typeof currencySchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function CurrenciesManager() {
  const { data: currencies = [], isLoading } = useCurrencies();
  const createCurrency = useCreateCurrency();
  const [createOpen, setCreateOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CurrencyForm>({
    resolver: zodResolver(currencySchema),
    defaultValues: { defaultRate: '1' },
  });

  const onSubmit = (data: CurrencyForm) => {
    const payload = { ...data, defaultRate: Number(data.defaultRate) };
    createCurrency.mutate(payload, { onSuccess: () => { setCreateOpen(false); reset(); } });
  };

  const columns: ColumnDef<Currency>[] = [
    { key: 'code', header: 'Kod', width: '80px', render: (r) => <span className="font-mono font-semibold text-sky-400">{r.code}</span> },
    { key: 'symbol', header: 'Sembol', width: '70px', render: (r) => <span className="text-slate-300">{r.symbol}</span> },
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200">{r.name}</span> },
    {
      key: 'defaultRate', header: 'Kur', width: '120px', align: 'right',
      render: (r) => <span className="font-mono text-slate-300">{r.defaultRate.toFixed(4)}</span>,
    },
    {
      key: 'isBase', header: 'Tür', width: '80px', align: 'center',
      render: (r) => <Badge variant={r.isBase ? 'success' : 'neutral'}>{r.isBase ? 'Ana' : 'Döviz'}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Para Birimleri"
        subtitle="Fatura ve ödemelerde kullanılan para birimlerini yönetin."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            Yeni Para Birimi
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={currencies}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Henüz para birimi eklenmemiş"
      />

      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); reset(); }}
        title="Yeni Para Birimi"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); reset(); }}>İptal</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={createCurrency.isPending}>Kaydet</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormRow cols={2}>
            <Input label="Kod" required placeholder="USD" error={errors.code?.message} {...register('code')} />
            <Input label="Sembol" required placeholder="$" error={errors.symbol?.message} {...register('symbol')} />
          </FormRow>
          <Input label="Ad" required placeholder="Amerikan Doları" error={errors.name?.message} {...register('name')} />
          <Input label="Varsayılan Kur" required type="number" step="0.0001" placeholder="1.0000" error={errors.defaultRate?.message} {...register('defaultRate')} />
        </form>
      </Modal>
    </div>
  );
}
