import { ReservationsPage } from '@/components/features/professional/ReservationsPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate plan="PROFESSIONAL"><ReservationsPage /></FeatureGate>; }
