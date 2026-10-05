import type { BackupEvidence, CompleteRestoreDrillInput, CreateRestoreDrillInput, DisasterRecoveryOverview, RecordBackupInput, RestoreDrill } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";
import type { DeploymentBackupSimulation, DeploymentOperationsSettings, DeploymentOperationsSnapshot } from "@/services/settings.service";
interface DataResponse<T> { data: T; }
export async function getDisasterRecoveryOverview(): Promise<DisasterRecoveryOverview> {
  return (await adminApiClient.get<DataResponse<DisasterRecoveryOverview>>("/api/admin/disaster-recovery")).data.data;
}
export async function recordBackup(input: RecordBackupInput): Promise<BackupEvidence> {
  return (await adminApiClient.post<DataResponse<BackupEvidence>>("/api/admin/disaster-recovery/backups", input)).data.data;
}
export async function createRestoreDrill(input: CreateRestoreDrillInput): Promise<RestoreDrill> {
  return (await adminApiClient.post<DataResponse<RestoreDrill>>("/api/admin/disaster-recovery/restore-drills", input)).data.data;
}
export async function completeRestoreDrill(id: string, input: CompleteRestoreDrillInput): Promise<RestoreDrill> {
  return (await adminApiClient.patch<DataResponse<RestoreDrill>>(`/api/admin/disaster-recovery/restore-drills/${id}`, input)).data.data;
}
export async function updateDisasterRecoveryPolicy(input: DisasterRecoveryOverview["policy"]): Promise<void> {
  await adminApiClient.put("/api/admin/disaster-recovery/policy", input);
}

export interface AdminDeploymentOperations {
  snapshot: DeploymentOperationsSnapshot;
  settings: DeploymentOperationsSettings;
}

const deploymentBase = (tenantId: string) => `/api/admin/tenants/${encodeURIComponent(tenantId)}/deployment-operations`;

export async function getAdminDeploymentOperations(tenantId: string): Promise<AdminDeploymentOperations> {
  return (await adminApiClient.get<DataResponse<AdminDeploymentOperations>>(deploymentBase(tenantId))).data.data;
}

export async function updateAdminDeploymentOperations(tenantId: string, settings: DeploymentOperationsSettings): Promise<void> {
  await adminApiClient.put(deploymentBase(tenantId), settings);
}

export async function simulateAdminDeploymentBackup(tenantId: string): Promise<DeploymentBackupSimulation> {
  return (await adminApiClient.post<DataResponse<DeploymentBackupSimulation>>(`${deploymentBase(tenantId)}/backup-simulation`)).data.data;
}
