'use client';

import { Suspense } from 'react';
import { PaymentFormPage } from '@/components/features/accounting/PaymentFormPage';

export default function NewPaymentPage() {
  return (
    <Suspense>
      <PaymentFormPage />
    </Suspense>
  );
}
