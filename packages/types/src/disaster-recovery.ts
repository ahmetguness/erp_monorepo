export type BackupStatus = "SUCCESS" | "FAILED";
export type RestoreDrillStatus = "PLANNED" | "RUNNING" | "PASSED" | "FAILED";
export interface BackupEvidence {
  id: string; providerRef: string; status: BackupStatus; sizeBytes: string;
  encrypted: boolean; encryptionKeyRef: string | null; region: string;
  replicaRegion: string | null; replicationLagSeconds: number | null;
  startedAt: string; completedAt: string; recordedAt: string;
}
export interface RestoreDrill {
  id: string; backupId: string; status: RestoreDrillStatus; environment: string;
  runbookUrl: string; approvalId: string; requestedById: string;
  startedAt: string | null; completedAt: string | null; recoveryPointAt: string | null;
  actualRpoMinutes: number | null; actualRtoMinutes: number | null; notes: string | null; createdAt: string;
}
export interface DisasterRecoveryOverview {
  policy: { targetRpoMinutes: number; targetRtoMinutes: number; maxReplicationLagSeconds: number };
  health: "HEALTHY" | "DEGRADED" | "CRITICAL";
  lastSuccessfulBackup: BackupEvidence | null; latestBackup: BackupEvidence | null;
  lastRestoreDrill: RestoreDrill | null; backups: BackupEvidence[]; restoreDrills: RestoreDrill[];
}
export interface RecordBackupInput {
  providerRef: string; status: BackupStatus; sizeBytes: string; encrypted: boolean;
  encryptionKeyRef?: string; region: string; replicaRegion?: string;
  replicationLagSeconds?: number; startedAt: string; completedAt: string;
}
export interface CreateRestoreDrillInput { backupId: string; environment: string; runbookUrl: string; approvalId: string; }
export interface CompleteRestoreDrillInput {
  status: "PASSED" | "FAILED"; recoveryPointAt: string; actualRpoMinutes: number;
  actualRtoMinutes: number; notes: string;
}
