'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useMasterData';
import { formatCurrency } from '@/lib/utils';
import { Select } from '@/components/ui/Select';
import type { Product } from '@/services/product.service';

export function ProductsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useProducts({ page, limit: 20, search: search || undefined, categoryId: categoryId || undefined });
  const { data: categories = [] } = useCategories();

  const categoryOptions = [
    { value: '', label: 'Tüm Kategoriler' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const columns: ColumnDef<Product>[] = [
    {
      key: 'code', header: 'Kod / Ad',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-200">{r.name}</p>
          <p className="text-xs text-slate-500 font-mono">{r.code}</p>
        </div>
      ),
    },
    {
      key: 'category', header: 'Kategori', width: '140px',
      render: (r) => <span className="text-sm text-slate-400">{r.category?.name ?? '—'}</span>,
    },
    {
      key: 'unit', header: 'Birim', width: '80px',
      render: (r) => <span className="text-sm text-slate-400">{r.unit?.code ?? '—'}</span>,
    },
    {
      key: 'salesPrice', header: 'Satış Fiyatı', width: '120px', align: 'right',
      render: (r) => <span className="font-medium text-slate-200">{formatCurrency(r.salesPrice)}</span>,
    },
    {
      key: 'purchasePrice', header: 'Alış Fiyatı', width: '120px', align: 'right',
      render: (r) => <span className="text-slate-400">{formatCurrency(r.purchasePrice)}</span>,
    },
    {
      key: 'isActive', header: 'Durum', width: '80px', align: 'center',
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ürünler"
        subtitle="Ürün kataloğunuzu yönetin."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/dashboard/products/new')}>Yeni Ürün</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Kod, ad, barkod ara…" className="w-64" />
        <Select options={categoryOptions} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-48" />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/products/${r.id}`)}
        emptyTitle="Ürün bulunamadı"
        emptyDescription="Yeni bir ürün ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
