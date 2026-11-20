'use client';
import { useReportWebVitals } from 'next/web-vitals';
const publish: Parameters<typeof useReportWebVitals>[0] = metric => {
  // Local, bounded-value diagnostics only. No URL, navigation ID, DOM entries,
  // identity, cookies or network export without a separate consent policy.
  if (!['LCP', 'CLS', 'INP', 'FCP', 'TTFB'].includes(metric.name) || !Number.isFinite(metric.value) || metric.value < 0)
    return;
  window.dispatchEvent(new CustomEvent('axon:web-vital', { detail: { name: metric.name, value: metric.value, rating: metric.rating } }));
};
export function WebVitals() { useReportWebVitals(publish); return null; }
