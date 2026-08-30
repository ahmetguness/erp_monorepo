'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ChevronLeft, ChevronRight, Settings2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { COUNTRY_OPTIONS, GOAL_OPTIONS, INDUSTRY_OPTIONS, SCALE_OPTIONS } from '@/components/features/onboarding/adaptive-onboarding.options';
import { FormRow } from '@/components/shared/FormField';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useRunQuickStart, useTenantSettings } from '@/hooks/useSettings';
import { useAuthStore } from '@/store/auth.store';

const wizardSchema = z.object({
  companyName: z.string().trim().min(2, 'Firma adı en az 2 karakter olmalıdır.'),
  country: z.string().length(2),
  industry: z.enum(['RETAIL', 'WHOLESALE', 'SERVICES', 'MANUFACTURING', 'ECOMMERCE', 'OTHER']),
  companyScale: z.enum(['MICRO', 'SMALL', 'MEDIUM', 'LARGE']),
  primaryGoal: z.enum(['SALES', 'FINANCE', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'SERVICE']),
  taxNumber: z.string().trim().optional(),
  taxOffice: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

type WizardForm = z.infer<typeof wizardSchema>;

export function QuickStartWizard() {
  const { data: settings = [], isLoading } = useTenantSettings();
  const runQuickStart = useRunQuickStart();
  const tenant = useAuthStore((state) => state.tenant);
  const [step, setStep] = useState<1 | 2>(1);
  const [showOptional, setShowOptional] = useState(false);
  const { register, handleSubmit, trigger, formState: { errors } } = useForm<WizardForm>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      companyName: tenant?.companyName ?? '',
      country: 'TR',
      industry: 'OTHER',
      companyScale: 'MICRO',
      primaryGoal: 'SALES',
      taxNumber: '',
      taxOffice: '',
      address: '',
      city: '',
    },
  });

  const completed = settings.some((setting) => setting.key === 'wizard_completed' && setting.value === 'true');
  if (isLoading || !tenant || completed) return null;

  async function continueToGoal(): Promise<void> {
    if (await trigger(['companyName', 'country', 'industry', 'companyScale'], { shouldFocus: true })) setStep(2);
  }

  function submit(values: WizardForm): void {
    runQuickStart.mutate(values);
  }

  async function handleWizardSubmit(values: WizardForm): Promise<void> {
    if (step === 1) {
      await continueToGoal();
      return;
    }
    submit(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <header className="border-b border-slate-800 p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-sky-500/10 p-2.5 text-sky-300"><Sparkles className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold text-white">Size uygun çalışma alanını hazırlayalım</h2>
              <p className="mt-1 text-xs text-slate-400">Beş kısa seçim yapın; temel ayarları sistem oluştursun. Ürün ve cari bilgilerini şimdi girmeniz gerekmez.</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <div className={step === 1 ? 'rounded-lg bg-sky-500/10 p-2 text-sky-300' : 'rounded-lg bg-emerald-500/10 p-2 text-emerald-300'}>1. Firma profili</div>
            <div className={step === 2 ? 'rounded-lg bg-sky-500/10 p-2 text-sky-300' : 'rounded-lg bg-slate-950 p-2 text-slate-500'}>2. Ana hedef</div>
          </div>
        </header>

        <form onSubmit={handleSubmit(handleWizardSubmit)} className="max-h-[480px] overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <Input label="Firma adı" required error={errors.companyName?.message} {...register('companyName')} />
              <FormRow cols={2}>
                <Select label="Ülke" required options={[...COUNTRY_OPTIONS]} error={errors.country?.message} {...register('country')} />
                <Select label="Sektör" required options={[...INDUSTRY_OPTIONS]} error={errors.industry?.message} {...register('industry')} />
              </FormRow>
              <Select label="Şirket ölçeği" required options={SCALE_OPTIONS.map((option) => ({ value: option.value, label: option.description ? `${option.label} — ${option.description}` : option.label }))} error={errors.companyScale?.message} {...register('companyScale')} />
              <button type="button" onClick={() => setShowOptional((value) => !value)} className="flex items-center gap-2 text-xs font-medium text-sky-300 hover:text-sky-200">
                <Settings2 className="h-4 w-4" />
                {showOptional ? 'İsteğe bağlı firma bilgilerini gizle' : 'Vergi ve adres bilgilerini şimdi ekle (isteğe bağlı)'}
              </button>
              {showOptional && (
                <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <FormRow cols={2}>
                    <Input label="Vergi numarası" {...register('taxNumber')} />
                    <Input label="Vergi dairesi" {...register('taxOffice')} />
                  </FormRow>
                  <Input label="Adres" {...register('address')} />
                  <Input label="Şehir" {...register('city')} />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                <Building2 className="mt-0.5 h-5 w-5 text-sky-300" />
                <p className="text-sm leading-6 text-slate-300">Ana hedefinize göre para birimi, vergi oranları, depo, fatura serisi ve önerilen modüller otomatik hazırlanacak. Bunları daha sonra ayarlardan değiştirebilirsiniz.</p>
              </div>
              <Select label="ERP'yi öncelikle ne için kullanacaksınız?" required options={[...GOAL_OPTIONS]} error={errors.primaryGoal?.message} {...register('primaryGoal')} />
            </div>
          )}
        </form>

        <footer className="flex items-center justify-between border-t border-slate-800 p-6">
          <Button type="button" variant="ghost" leftIcon={<ChevronLeft className="h-4 w-4" />} disabled={step === 1} onClick={() => setStep(1)}>Geri</Button>
          {step === 1 ? (
            <Button type="button" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={continueToGoal}>Devam</Button>
          ) : (
            <Button type="button" loading={runQuickStart.isPending} onClick={handleSubmit(submit)}>Çalışma alanını hazırla</Button>
          )}
        </footer>
      </section>
    </div>
  );
}
