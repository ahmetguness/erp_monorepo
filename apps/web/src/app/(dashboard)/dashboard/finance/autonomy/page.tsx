import { Metadata } from 'next';
import { FinancialAutonomyCenter } from '@/components/features/finance/FinancialAutonomyCenter';

export const metadata: Metadata = {
  title: 'Proaktif Finansal Otonomi | AXON ERP',
  description: 'Nakit akışı projeksiyonu, dinamik tahsilat iskontoları ve otonom likidite dengeleme',
};

export default function FinancialAutonomyPage() {
  return <FinancialAutonomyCenter />;
}
