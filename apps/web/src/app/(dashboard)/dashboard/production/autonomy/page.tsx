import { Metadata } from 'next';
import { ProductionAutonomyCenter } from '@/components/features/production/ProductionAutonomyCenter';

export const metadata: Metadata = {
  title: 'Otonom Üretim & Kapasite Çizelgeleme | AXON ERP',
  description: 'İş merkezi kapasite ve darboğaz analizi, otonom vardiya çizelgelemesi ve kestirimci bakım stok kilitleme',
};

export default function ProductionAutonomyPage() {
  return <ProductionAutonomyCenter />;
}
