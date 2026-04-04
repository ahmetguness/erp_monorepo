'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormRow, FormSection } from '@/components/shared/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useContact, useCreateContact, useUpdateContact } from '@/hooks/useContacts';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const contactSchema = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  name: z.string().min(1, 'Ad zorunludur'),
  code: z.string().optional(),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  email: z.string().email('Geçerli e-posta girin').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  creditLimit: z.string().optional(),
  paymentTermDays: z.string().optional(),
  notes: z.string().optional(),
});

type ContactForm = z.infer<typeof contactSchema>;

const TYPE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Müşteri' },
  { value: 'SUPPLIER', label: 'Tedarikçi' },
  { value: 'BOTH', label: 'Her İkisi' },
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props { editId?: string }

export function ContactFormPage({ editId }: Props) {
  const router = useRouter();
  const isEdit = !!editId;

  const { data: existing, isLoading: loadingExisting } = useContact(editId ?? '');
  const createContact = useCreateContact();
  const updateContact = useUpdateContact(editId ?? '');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { type: 'CUSTOMER', country: 'TR' },
  });

  // Populate form when editing
  useEffect(() => {
    if (existing) {
      reset({
        type: existing.type,
        name: existing.name,
        code: existing.code ?? '',
        taxNumber: existing.taxNumber ?? '',
        taxOffice: existing.taxOffice ?? '',
        email: existing.email ?? '',
        phone: existing.phone ?? '',
        website: existing.website ?? '',
        address: existing.address ?? '',
        city: existing.city ?? '',
        country: existing.country,
        creditLimit: existing.creditLimit != null ? String(existing.creditLimit) : '',
        paymentTermDays: existing.paymentTermDays != null ? String(existing.paymentTermDays) : '',
        notes: existing.notes ?? '',
      });
    }
  }, [existing, reset]);

  const onSubmit = (data: ContactForm) => {
    const payload = {
      type: data.type,
      name: data.name,
      code: data.code || undefined,
      taxNumber: data.taxNumber || undefined,
      taxOffice: data.taxOffice || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      website: data.website || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      country: data.country || 'TR',
      creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
      paymentTermDays: data.paymentTermDays ? Number(data.paymentTermDays) : undefined,
      notes: data.notes || undefined,
    };

    if (isEdit) {
      updateContact.mutate(payload, { onSuccess: () => router.push(`/dashboard/contacts/${editId}`) });
    } else {
      createContact.mutate(payload, { onSuccess: (c) => router.push(`/dashboard/contacts/${c.id}`) });
    }
  };

  if (isEdit && loadingExisting) return <FullPageSpinner />;

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Cari Hesap Düzenle' : 'Yeni Cari Hesap'}
        action={
          <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>
            Geri
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormSection title="Temel Bilgiler">
          <FormRow cols={2}>
            <Select label="Tip" required options={TYPE_OPTIONS} error={errors.type?.message} {...register('type')} />
            <Input label="Ad" required placeholder="Şirket veya kişi adı" error={errors.name?.message} {...register('name')} />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Kod" placeholder="C001" error={errors.code?.message} {...register('code')} />
            <Input label="Vergi No" placeholder="1234567890" error={errors.taxNumber?.message} {...register('taxNumber')} />
          </FormRow>
          <Input label="Vergi Dairesi" placeholder="Kadıköy" error={errors.taxOffice?.message} {...register('taxOffice')} />
        </FormSection>

        <FormSection title="İletişim">
          <FormRow cols={2}>
            <Input label="E-posta" type="email" placeholder="info@sirket.com" error={errors.email?.message} {...register('email')} />
            <Input label="Telefon" placeholder="+90 555 000 0000" error={errors.phone?.message} {...register('phone')} />
          </FormRow>
          <Input label="Website" placeholder="https://sirket.com" error={errors.website?.message} {...register('website')} />
          <Input label="Adres" placeholder="Mahalle, Sokak, No" error={errors.address?.message} {...register('address')} />
          <FormRow cols={2}>
            <Input label="Şehir" placeholder="İstanbul" error={errors.city?.message} {...register('city')} />
            <Input label="Ülke" placeholder="TR" error={errors.country?.message} {...register('country')} />
          </FormRow>
        </FormSection>

        <FormSection title="Ticari Koşullar">
          <FormRow cols={2}>
            <Input label="Kredi Limiti (₺)" type="number" placeholder="10000" error={errors.creditLimit?.message} {...register('creditLimit')} />
            <Input label="Ödeme Vadesi (gün)" type="number" placeholder="30" error={errors.paymentTermDays?.message} {...register('paymentTermDays')} />
          </FormRow>
        </FormSection>

        <FormSection title="Notlar">
          <Textarea placeholder="Ek notlar…" {...register('notes')} />
        </FormSection>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            {isEdit ? 'Güncelle' : 'Kaydet'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>İptal</Button>
        </div>
      </form>
    </div>
  );
}
