import { FeatureGate } from '@/components/shared/FeatureGate';
import { WorkflowCenterPage } from '@/components/features/workflow/WorkflowCenterPage';

export default function Page() {
  return (
    <FeatureGate feature="workflowCenter" plan="PROFESSIONAL">
      <WorkflowCenterPage />
    </FeatureGate>
  );
}
