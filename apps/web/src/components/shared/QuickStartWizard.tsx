'use client';

import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Coins, Package, Users, Check, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useTenantSettings, useRunQuickStart } from '@/hooks/useSettings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormRow } from '@/components/shared/FormField';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const requiredText = (message: string) => z.string().trim().min(1, message);

const wizardSchema = z.object({
  // Step 1: Firma ve Vergi
  companyName: requiredText('Firma adı zorunludur'),
  taxOffice: requiredText('Vergi dairesi zorunludur'),
  taxNumber: requiredText('Vergi numarası zorunludur'),
  address: requiredText('Adres zorunludur'),
  city: requiredText('Şehir zorunludur'),
  
  // Step 2: Sistem Parametreleri
  warehouseName: requiredText('Depo adı zorunludur'),
  currencyCode: requiredText('Para birimi seçiniz'),
  
  // Step 3: İlk Ürün
  firstProductCode: requiredText('Ürün kodu zorunludur'),
  firstProductName: requiredText('Ürün adı zorunludur'),
  firstProductPrice: z.number({ error: 'Birim satış fiyatı zorunludur' }).min(0, 'Fiyat sıfırdan küçük olamaz'),
  firstProductTaxRate: z.number({ error: 'KDV oranı seçiniz' }).min(0, 'KDV oranı 0 ile 100 arasında olmalıdır').max(100, 'KDV oranı 0 ile 100 arasında olmalıdır'),
  
  // Step 4: İlk Cari
  firstContactName: requiredText('Cari adı zorunludur'),
  firstContactCode: requiredText('Cari kodu zorunludur'),
  firstContactType: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  firstContactEmail: z.string().email('Geçersiz e-posta adresi').or(z.literal('')),
  firstContactPhone: z.string().optional(),
});

type WizardForm = z.infer<typeof wizardSchema>;

const stepFields: Record<number, Array<keyof WizardForm>> = {
  1: ['companyName', 'taxOffice', 'taxNumber', 'address', 'city'],
  2: ['warehouseName', 'currencyCode'],
  3: ['firstProductCode', 'firstProductName', 'firstProductPrice', 'firstProductTaxRate'],
  4: ['firstContactCode', 'firstContactName', 'firstContactType'],
};

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
      firstProductCode: 'URT-01',
      firstProductName: 'Örnek Hizmet / Ürün',
      firstProductPrice: 100,
      firstProductTaxRate: 20,
      firstContactName: 'Örnek Müşteri Ltd. Şti.',
      firstContactCode: 'MFT-01',
      firstContactType: 'BOTH',
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
      setStep((p) => p + 1);
      return;
    }

    const firstInvalidField = fieldsToValidate.find((field) => getFieldState(field).invalid);
    if (firstInvalidField) setFocus(firstInvalidField);
  };

  const handleBack = () => {
    setStep((p) => Math.max(1, p - 1));
  };

  const onSubmit = (data: WizardForm) => {
    runQuickStart.mutate(data);
  };

  const handleInvalidSubmit = (invalidErrors: FieldErrors<WizardForm>) => {
    const firstInvalidField = stepFields[4].find((field) => invalidErrors[field]);
    if (firstInvalidField) setFocus(firstInvalidField);
  };

  const steps = [
    { num: 1, label: 'Firma', icon: Building2 },
    { num: 2, label: 'Sistem', icon: Coins },
    { num: 3, label: 'İlk Ürün', icon: Package },
    { num: 4, label: 'İlk Cari', icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Decorative backdrop */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header */}
        <div className="relative p-6 border-b border-slate-800/60 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Hızlı Başlangıç Sihirbazı</h2>
              <p className="text-xs text-slate-500 mt-0.5">Sistemi kullanmaya başlamak için temel bilgileri doldurun.</p>
            </div>
          </div>

          {/* Stepper indicator */}
          <div className="flex items-center justify-between mt-6 max-w-md mx-auto">
            {steps.map((s, index) => {
              const Icon = s.icon;
              const active = step >= s.num;
              const isCurrent = step === s.num;
              return (
                <div key={s.num} className="flex items-center flex-1 last:flex-initial">
                  <div className="flex flex-col items-center gap-1.5 relative">
                    <div className={cn(
                      'w-8 h-8 rounded-full border flex items-center justify-center text-xs font-semibold transition-all duration-300',
                      isCurrent ? 'border-sky-500 bg-sky-500/10 text-sky-400 ring-4 ring-sky-500/15' :
                      active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' :
                      'border-slate-800 bg-slate-950 text-slate-600'
                    )}>
                      {active && step > s.num ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <span className={cn('text-[10px] font-medium transition-colors', active ? 'text-slate-300' : 'text-slate-600')}>{s.label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={cn(
                      'h-0.5 flex-1 mx-2 -mt-4 transition-all duration-500',
                      step > s.num ? 'bg-emerald-500/50' : 'bg-slate-800'
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[400px]">
          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Input label="Firma / Şirket Adı" required placeholder="Örn: Axon Teknoloji A.Ş." error={errors.companyName?.message} {...register('companyName')} />
                <FormRow cols={2}>
                  <Input label="Vergi Dairesi" required placeholder="Örn: Kadıköy V.D." error={errors.taxOffice?.message} {...register('taxOffice')} />
                  <Input label="Vergi Numarası" required placeholder="10 haneli veya T.C. Kimlik" error={errors.taxNumber?.message} {...register('taxNumber')} />
                </FormRow>
                <Input label="Adres" required placeholder="Firma açık adresi..." error={errors.address?.message} {...register('address')} />
                <Input label="Şehir" required placeholder="Örn: İstanbul" error={errors.city?.message} {...register('city')} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Input label="Depo Adı" required placeholder="Örn: Merkez Depo" error={errors.warehouseName?.message} {...register('warehouseName')} />
                <Select
                  label="Para Birimi"
                  required
                  options={[
                    { value: 'TRY', label: 'TRY - Türk Lirası (₺)' },
                    { value: 'USD', label: 'USD - Amerikan Doları ($)' },
                    { value: 'EUR', label: 'EUR - Euro (€)' },
                  ]}
                  error={errors.currencyCode?.message}
                  {...register('currencyCode')}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <FormRow cols={2}>
                  <Input label="Ürün / Hizmet Kodu" required placeholder="Örn: PRD-01" error={errors.firstProductCode?.message} {...register('firstProductCode')} />
                  <Input label="Ürün / Hizmet Adı" required placeholder="Örn: Yazılım Danışmanlığı" error={errors.firstProductName?.message} {...register('firstProductName')} />
                </FormRow>
                <FormRow cols={2}>
                  <Input label="Birim Satış Fiyatı" required type="number" step="0.01" error={errors.firstProductPrice?.message} {...register('firstProductPrice', { valueAsNumber: true })} />
                  <Select
                    label="KDV Oranı (%)"
                    required
                    options={[
                      { value: '20', label: '%20 (Standart KDV)' },
                      { value: '10', label: '%10 (İndirimli KDV)' },
                      { value: '1', label: '%1 (Gıda vb. KDV)' },
                      { value: '0', label: '%0 (Muaf)' },
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
                  <Input label="Cari Kodu" required placeholder="Örn: CAR-01" error={errors.firstContactCode?.message} {...register('firstContactCode')} />
                  <Input label="Cari Adı / Ünvanı" required placeholder="Örn: ABC Müşteri Ltd. Şti." error={errors.firstContactName?.message} {...register('firstContactName')} />
                </FormRow>
                <Select
                  label="Cari Tipi"
                  required
                  options={[
                    { value: 'BOTH', label: 'Hem Müşteri hem Tedarikçi' },
                    { value: 'CUSTOMER', label: 'Sadece Müşteri' },
                    { value: 'SUPPLIER', label: 'Sadece Tedarikçi' },
                  ]}
                  error={errors.firstContactType?.message}
                  {...register('firstContactType')}
                />
                <FormRow cols={2}>
                  <Input label="E-Posta (Opsiyonel)" placeholder="örn@mail.com" error={errors.firstContactEmail?.message} {...register('firstContactEmail')} />
                  <Input label="Telefon (Opsiyonel)" placeholder="0555..." error={errors.firstContactPhone?.message} {...register('firstContactPhone')} />
                </FormRow>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/20 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={handleBack}
            disabled={step === 1}
          >
            Geri
          </Button>

          {step < 4 ? (
            <Button
              type="button"
              rightIcon={<ChevronRight className="w-4 h-4" />}
              onClick={handleNext}
            >
              İleri
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit(onSubmit, handleInvalidSubmit)}
              loading={runQuickStart.isPending}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20"
            >
              Kurulumu Tamamla
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
