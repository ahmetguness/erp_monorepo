import type { Metadata } from 'next';
import { OperationsCenter } from '@/components/features/operations/OperationsCenter';

export const metadata: Metadata = {
  title: 'Operations & Observability — Axon ERP',
  description: 'Operasyon izlenebilirliği, otomasyon sağlığı ve varlık zaman çizelgesi',
};

export default function OperationsPage() {
  return <OperationsCenter />;
}
