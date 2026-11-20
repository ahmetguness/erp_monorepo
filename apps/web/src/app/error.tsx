'use client';
import { ApiErrorState } from '@/components/shared/ApiErrorState';
export default function ErrorPage({ retry }: {
  error: unknown;
  retry: () => void;
}) {
  return <main className="mx-auto max-w-lg p-6"><ApiErrorState error={{ error: { code: 'RENDER_ERROR', message: 'Ekran yüklenemedi. Yeniden deneyin; sorun sürerse destek ekibine başvurun.' } }} onRetry={retry} /></main>;
}
