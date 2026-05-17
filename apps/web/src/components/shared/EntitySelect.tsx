'use client';

import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { useBankAccounts, useCashAccounts } from '@/hooks/useAccounting';
import { useContacts } from '@/hooks/useContacts';
import { useEmployees } from '@/hooks/useHR';
import { useBOMs } from '@/hooks/useProduction';
import { useProductBatches } from '@/hooks/useProductBatches';
import { useDeliveryNotes } from '@/hooks/useDeliveryNotes';
import { useInvoices } from '@/hooks/useSales';
import { useCustomerAssets } from '@/hooks/useService';
import { useProducts } from '@/hooks/useProducts';
import { useWarehouses } from '@/hooks/useStock';
import type { ContactType } from '@/services/contact.service';
import type { InvoiceStatus, InvoiceType } from '@/services/sales.service';

const SELECT_LIMIT = 200;

interface EntitySelectProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
}

function option(value: string, label: string): ComboboxOption {
  return { value, label };
}

function compactLabel(parts: Array<string | null | undefined>, separator = ' - ') {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
}

export function ProductSelect(props: EntitySelectProps) {
  const { data } = useProducts({ page: 1, limit: SELECT_LIMIT, isActive: true });
  const options = useMemo(
    () => data?.data.map((product) => option(product.id, compactLabel([product.code, product.name]))) ?? [],
    [data],
  );

  return <Combobox placeholder="Ürün ara..." options={options} {...props} />;
}

export function WarehouseSelect(props: EntitySelectProps) {
  const { data = [] } = useWarehouses();
  const options = useMemo(
    () => data.filter((warehouse) => warehouse.isActive).map((warehouse) => option(warehouse.id, compactLabel([warehouse.code, warehouse.name]))),
    [data],
  );

  return <Combobox placeholder="Depo ara..." options={options} {...props} />;
}

export function ContactSelect({ type, ...props }: EntitySelectProps & { type?: ContactType | ContactType[] }) {
  const queryType = typeof type === 'string' ? type : undefined;
  const allowedTypes = Array.isArray(type) ? type : undefined;
  const { data } = useContacts({ page: 1, limit: SELECT_LIMIT, type: queryType, isActive: true });
  const options = useMemo(
    () =>
      data?.data
        .filter((contact) => !allowedTypes || allowedTypes.includes(contact.type))
        .map((contact) => option(contact.id, compactLabel([contact.code, contact.name]))) ?? [],
    [allowedTypes, data],
  );

  return <Combobox placeholder="Cari ara..." options={options} {...props} />;
}

export function EmployeeSelect(props: EntitySelectProps) {
  const { data } = useEmployees({ page: 1, limit: SELECT_LIMIT, isActive: 'true' });
  const options = useMemo(
    () => data?.data.map((employee) => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      return option(employee.id, compactLabel([name, employee.department, employee.position]));
    }) ?? [],
    [data],
  );

  return <Combobox placeholder="Personel ara..." options={options} {...props} />;
}

export function BankAccountSelect(props: EntitySelectProps) {
  const { data = [] } = useBankAccounts();
  const options = useMemo(
    () => data.filter((account) => account.isActive).map((account) => option(account.id, compactLabel([account.name, account.bankName, account.currencyCode]))),
    [data],
  );

  return <Combobox placeholder="Banka hesabı ara..." options={options} {...props} />;
}

export function CashAccountSelect(props: EntitySelectProps) {
  const { data = [] } = useCashAccounts();
  const options = useMemo(
    () => data.filter((account) => account.isActive).map((account) => option(account.id, compactLabel([account.name, account.currencyCode]))),
    [data],
  );

  return <Combobox placeholder="Kasa hesabı ara..." options={options} {...props} />;
}

export function BomSelect(props: EntitySelectProps) {
  const { data } = useBOMs({ page: 1, limit: SELECT_LIMIT });
  const options = useMemo(
    () => data?.data.map((bom) => option(bom.id, compactLabel([bom.name, `v${bom.version}`, bom.product?.name]))) ?? [],
    [data],
  );

  return <Combobox placeholder="BOM ara..." options={options} {...props} />;
}

export function ProductBatchSelect({ productId, ...props }: EntitySelectProps & { productId?: string }) {
  const { data } = useProductBatches({ page: 1, limit: SELECT_LIMIT, ...(productId ? { productId } : {}) });
  const options = useMemo(
    () => data?.data.map((batch) => option(batch.id, compactLabel([batch.batchNumber, batch.product?.name]))) ?? [],
    [data],
  );

  return <Combobox placeholder="Parti ara..." options={options} {...props} />;
}

export function InvoiceSelect({
  contactId,
  type,
  statuses,
  ...props
}: EntitySelectProps & { contactId?: string; type?: InvoiceType; statuses?: InvoiceStatus[] }) {
  const { data } = useInvoices({ page: 1, limit: SELECT_LIMIT, ...(contactId ? { contactId } : {}), ...(type ? { type } : {}) });
  const options = useMemo(
    () =>
      data?.data
        .filter((invoice) => !statuses || statuses.includes(invoice.status))
        .map((invoice) => option(invoice.id, compactLabel([invoice.number, invoice.contact?.name]))) ?? [],
    [data, statuses],
  );

  return <Combobox placeholder="Fatura ara..." options={options} {...props} />;
}

export function DeliveryNoteSelect(props: EntitySelectProps) {
  const { data } = useDeliveryNotes({ page: 1, limit: SELECT_LIMIT });
  const options = useMemo(
    () => data?.data.map((note) => option(note.id, compactLabel([note.number, note.contact?.name]))) ?? [],
    [data],
  );

  return <Combobox placeholder="İrsaliye ara..." options={options} {...props} />;
}

export function CustomerAssetSelect({ contactId, ...props }: EntitySelectProps & { contactId?: string }) {
  const { data } = useCustomerAssets({ page: 1, limit: SELECT_LIMIT, ...(contactId ? { contactId } : {}) });
  const options = useMemo(
    () => data?.data.map((asset) => option(asset.id, compactLabel([asset.name, asset.serialNo, asset.contact?.name]))) ?? [],
    [data],
  );

  return <Combobox placeholder="Varlık ara..." options={options} {...props} />;
}
