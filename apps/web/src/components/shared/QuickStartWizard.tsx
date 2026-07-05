'use client';

import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Check, ChevronLeft, ChevronRight, Coins, Package, Sparkles, Users } from 'lucide-react';
import { useTenantSettings, useRunQuickStart } from '@/hooks/useSettings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormRow } from '@/components/shared/FormField';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const requiredText = (message: string) => z.string().trim().min(1, message);

const wizardSchema = z.object({
  companyName: requiredText('Firma adi zorunludur'),
  taxOffice: requiredText('Vergi dairesi zorunludur'),
  taxNumber: requiredText('Vergi numarasi zorunludur'),
  address: requiredText('Adres zorunludur'),
  city: requiredText('Sehir zorunludur'),
  warehouseName: requiredText('Depo adi zorunludur'),
  currencyCode: requiredText('Para birimi seciniz'),
  invoicePrefix: requiredText('Fatura prefixi zorunludur').max(12, 'Fatura prefixi en fazla 12 karakter olabilir'),
  firstProductCode: requiredText('Urun kodu zorunludur'),
  firstProductName: requiredText('Urun adi zorunludur'),
  firstProductPrice: z.number({ error: 'Birim satis fiyati zorunludur' }).min(0, 'Fiyat sifirdan kucuk olamaz'),
  firstProductTaxRate: z.number({ error: 'KDV orani seciniz' }).min(0, 'KDV orani 0 ile 100 arasinda olmalidir').max(100, 'KDV orani 0 ile 100 arasinda olmalidir'),
  firstContactName: requiredText('Cari adi zorunludur'),
  firstContactCode: requiredText('Cari kodu zorunludur'),
  firstContactType: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  firstContactTaxNumber: requiredText('Cari vergi numarasi zorunludur'),
  firstContactEmail: z.string().email('Gecersiz e-posta adresi').or(z.literal('')),
  firstContactPhone: z.string().optional(),
});

type WizardForm = z.infer<typeof wizardSchema>;

const stepFields: Record<number, Array<keyof WizardForm>> = {
  1: ['companyName', 'taxOffice', 'taxNumber', 'address', 'city'],
  2: ['warehouseName', 'currencyCode', 'invoicePrefix'],
  3: ['firstProductCode', 'firstProductName', 'firstProductPrice', 'firstProductTaxRate'],
  4: ['firstContactCode', 'firstContactName', 'firstContactType', 'firstContactTaxNumber'],
};

const steps = [
  { num: 1, label: 'Firma', icon: Building2 },
  { num: 2, label: 'Sistem', icon: Coins },
  { num: 3, label: 'Ilk Urun', icon: Package },
  { num: 4, label: 'Ilk Cari', icon: Users },
] as const;

export function QuickStartWizard() {
  const { data: settings = [], isLoading: loadingSettings } = useTenantSettings();
  const runQuickStart = useRunQuickStart();
  const tenant = useAuthStore((s) => s.tenant);
  const [step, setStep] = useState(1);

  const { register, handleSubmit, trigger, setFocus, getFieldState, formState: { errors } } = useForm<WizardForm>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      companyName: tenant?.companyName ?? '',
      taxOffice: '',
      taxNumber: '',
      address: '',
      city: '',
      warehouseName: 'Merkez Depo',
      currencyCode: 'TRY',
      invoicePrefix: 'INV',
      firstProductCode: 'URT-01',
      firstProductName: 'Ornek Hizmet / Urun',
      firstProductPrice: 100,
      firstProductTaxRate: 20,
      firstContactName: 'Ornek Musteri Ltd. Sti.',
      firstContactCode: 'MFT-01',
      firstContactType: 'BOTH',
      firstContactTaxNumber: '1111111111',
      firstContactEmail: '',
      firstContactPhone: '',
    },
  });

  const isCompleted = settings.some((s) => s.key === 'wizard_completed' && s.value === 'true');

  if (loadingSettings || !tenant || isCompleted) {
    return null;
  }

  const handleNext = async () => {
    const fieldsToValidate = stepFields[step] ?? [];
    const isValid = await trigger(fieldsToValidate, { shouldFocus: true });
    if (isValid) {
      setStep((current) => current + 1);
      return;
    }

    const firstInvalidField = fieldsToValidate.find((field) => getFieldState(field).invalid);
    if (firstInvalidField) setFocus(firstInvalidField);
  };

  const handleInvalidSubmit = (invalidErrors: FieldErrors<WizardForm>) => {
    const firstInvalidField = stepFields[4].find((field) => invalidErrors[field]);
    if (firstInvalidField) setFocus(firstInvalidField);
  };

  const onSubmit = (data: WizardForm) => {
    runQuickStart.mutate({
      ...data,
      invoicePrefix: data.invoicePrefix.trim().toLocaleUpperCase('tr-TR'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative border-b border-slate-800/60 bg-slate-900/40 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Hizli Baslangic Sihirbazi</h2>
              <p className="mt-0.5 text-xs text-slate-500">Sirket, vergi, para birimi, fatura prefixi, ilk urun ve ilk cari adimlarini tamamlayin.</p>
            </div>
          </div>

          <div className="mx-auto mt-6 flex max-w-md items-center justify-between">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const active = step >= item.num;
              const current = step === item.num;
              return (
                <div key={item.num} className="flex flex-1 items-center last:flex-initial">
                  <div className="relative flex flex-col items-center gap-1.5">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300',
                      current ? 'border-sky-500 bg-sky-500/10 text-sky-400 ring-4 ring-sky-500/15' :
                        active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' :
                          'border-slate-800 bg-slate-950 text-slate-600',
                    )}>
                      {active && step > item.num ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <span className={cn('text-[10px] font-medium transition-colors', active ? 'text-slate-300' : 'text-slate-600')}>{item.label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={cn('mx-2 -mt-4 h-0.5 flex-1 transition-all duration-500', step > item.num ? 'bg-emerald-500/50' : 'bg-slate-800')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="max-h-[400px] flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Input label="Firma / Sirket Adi" required placeholder="Orn: Axon Teknoloji A.S." error={errors.companyName?.message} {...register('companyName')} />
                <FormRow cols={2}>
                  <Input label="Vergi Dairesi" required placeholder="Orn: Kadikoy V.D." error={errors.taxOffice?.message} {...register('taxOffice')} />
                  <Input label="Vergi Numarasi" required placeholder="10 haneli veya T.C. Kimlik" error={errors.taxNumber?.message} {...register('taxNumber')} />
                </FormRow>
                <Input label="Adres" required placeholder="Firma acik adresi" error={errors.address?.message} {...register('address')} />
                <Input label="Sehir" required placeholder="Orn: Istanbul" error={errors.city?.message} {...register('city')} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Input label="Depo Adi" required placeholder="Orn: Merkez Depo" error={errors.warehouseName?.message} {...register('warehouseName')} />
                <FormRow cols={2}>
                  <Select
                    label="Para Birimi"
                    required
                    options={[
                      { value: 'TRY', label: 'TRY - Turk Lirasi' },
                      { value: 'USD', label: 'USD - Amerikan Dolari' },
                      { value: 'EUR', label: 'EUR - Euro' },
                    ]}
                    error={errors.currencyCode?.message}
                    {...register('currencyCode')}
                  />
                  <Input
                    label="Fatura Prefix'i"
                    required
                    placeholder="INV"
                    maxLength={12}
                    helperText="Ornek: INV-000001"
                    error={errors.invoicePrefix?.message}
                    {...register('invoicePrefix')}
                  />
                </FormRow>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <FormRow cols={2}>
                  <Input label="Urun / Hizmet Kodu" required placeholder="Orn: PRD-01" error={errors.firstProductCode?.message} {...register('firstProductCode')} />
                  <Input label="Urun / Hizmet Adi" required placeholder="Orn: Yazilim Danismanligi" error={errors.firstProductName?.message} {...register('firstProductName')} />
                </FormRow>
                <FormRow cols={2}>
                  <Input label="Birim Satis Fiyati" required type="number" step="0.01" error={errors.firstProductPrice?.message} {...register('firstProductPrice', { valueAsNumber: true })} />
                  <Select
                    label="KDV Orani (%)"
                    required
                    options={[
                      { value: '20', label: '%20 Standart KDV' },
                      { value: '10', label: '%10 Indirimli KDV' },
                      { value: '1', label: '%1 Gida vb. KDV' },
                      { value: '0', label: '%0 Muaf' },
                    ]}
                    error={errors.firstProductTaxRate?.message}
                    {...register('firstProductTaxRate', { valueAsNumber: true })}
                  />
                </FormRow>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <FormRow cols={2}>
                  <Input label="Cari Kodu" required placeholder="Orn: CAR-01" error={errors.firstContactCode?.message} {...register('firstContactCode')} />
                  <Input label="Cari Adi / Unvani" required placeholder="Orn: ABC Musteri Ltd. Sti." error={errors.firstContactName?.message} {...register('firstContactName')} />
                </FormRow>
                <Select
                  label="Cari Tipi"
                  required
                  options={[
                    { value: 'BOTH', label: 'Hem Musteri hem Tedarikci' },
                    { value: 'CUSTOMER', label: 'Sadece Musteri' },
                    { value: 'SUPPLIER', label: 'Sadece Tedarikci' },
                  ]}
                  error={errors.firstContactType?.message}
                  {...register('firstContactType')}
                />
                <Input label="Cari Vergi Numarasi" required placeholder="10 haneli vergi no veya T.C. Kimlik" error={errors.firstContactTaxNumber?.message} {...register('firstContactTaxNumber')} />
                <FormRow cols={2}>
                  <Input label="E-Posta (Opsiyonel)" placeholder="ornek@mail.com" error={errors.firstContactEmail?.message} {...register('firstContactEmail')} />
                  <Input label="Telefon (Opsiyonel)" placeholder="0555..." error={errors.firstContactPhone?.message} {...register('firstContactPhone')} />
                </FormRow>
              </div>
            )}
          </form>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/20 p-6">
          <Button
            type="button"
            variant="ghost"
            leftIcon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            disabled={step === 1}
          >
            Geri
          </Button>

          {step < 4 ? (
            <Button type="button" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={handleNext}>
              Ileri
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit(onSubmit, handleInvalidSubmit)}
              loading={runQuickStart.isPending}
              className="bg-gradient-to-r from-sky-500 to-sky-600 shadow-lg shadow-sky-500/20 hover:from-sky-400 hover:to-sky-500"
            >
              Kurulumu Tamamla
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
