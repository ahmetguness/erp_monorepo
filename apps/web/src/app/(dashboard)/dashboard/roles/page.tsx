import { RolesPage } from '@/components/features/professional/RolesPage';
import { FeatureGate } from '@/components/shared/FeatureGate';
export default function Page() { return <FeatureGate feature="roleManagement" plan="PROFESSIONAL"><RolesPage /></FeatureGate>; }
