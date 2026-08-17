import { Metadata } from 'next';
import { MarketplacePricingCenter } from '@/components/features/marketplace/MarketplacePricingCenter';

export const metadata: Metadata = {
  title: 'Akıllı Pazaryeri & Dinamik Fiyatlandırma | AXON ERP',
  description: 'Marj odaklı otomatik repricing ve kanallar arası stok tamponu dengeleme',
};

export default function MarketplacePricingPage() {
  return <MarketplacePricingCenter />;
}
