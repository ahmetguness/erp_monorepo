import type { BackupEvidence, CompleteRestoreDrillInput, CreateRestoreDrillInput, DisasterRecoveryOverview, RecordBackupInput, RestoreDrill } from "@repo/types";
import { adminApiClient } from "@/lib/admin-api-client";
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
