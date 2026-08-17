import { Metadata } from 'next';
import { ProcurementAutonomyCenter } from '@/components/features/procurement/ProcurementAutonomyCenter';

export const metadata: Metadata = {
  title: 'Otonom Satın Alma & Tedarik Zinciri | AXON ERP',
  description: 'Stok projeksiyonları, tedarikçi güvenilirlik indeksleri ve sıfır dokunuşlu satın alma sipariş gönderimi',
};

export default function ProcurementAutonomyPage() {
  return <ProcurementAutonomyCenter />;
}
