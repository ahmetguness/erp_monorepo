import { BankTransactionsPage } from '@/components/features/professional/BankTransactionsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><BankTransactionsPage /></FeatureGate>; }
