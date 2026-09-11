import { z } from "zod";

export const recordBackupSchema = z.object({
  providerRef: z.string().trim().min(3).max(160), status: z.enum(["SUCCESS", "FAILED"]),
  sizeBytes: z.string().regex(/^\d+$/).refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, "Yedek boyutu veritabanı sınırını aşıyor."), encrypted: z.boolean(), encryptionKeyRef: z.string().trim().min(2).max(160).optional(),
  region: z.string().trim().min(2).max(80), replicaRegion: z.string().trim().min(2).max(80).optional(),
  replicationLagSeconds: z.number().int().min(0).max(86400).optional(),
  startedAt: z.coerce.date(), completedAt: z.coerce.date(),
}).strict()
  .refine((value) => value.completedAt >= value.startedAt, { message: "Tamamlanma zamanı başlangıçtan önce olamaz." })
  .refine((value) => !value.encrypted || Boolean(value.encryptionKeyRef), { message: "Şifreli yedek için KMS anahtar referansı zorunludur.", path: ["encryptionKeyRef"] })
  .refine((value) => value.replicationLagSeconds === undefined || Boolean(value.replicaRegion), { message: "Replikasyon gecikmesi için replika bölgesi zorunludur.", path: ["replicaRegion"] });
export const createRestoreDrillSchema = z.object({
  backupId: z.string().trim().min(1), environment: z.string().trim().min(3).max(120),
  runbookUrl: z.string().url().max(500), approvalId: z.string().trim().min(3).max(120),
}).strict().refine((value) => !/(^|[-_\s])(prod|production)([-_\s]|$)/i.test(value.environment), { message: "Restore tatbikatı production ortamında çalıştırılamaz.", path: ["environment"] });
export const completeRestoreDrillSchema = z.object({
  status: z.enum(["PASSED", "FAILED"]), recoveryPointAt: z.coerce.date(),
  actualRpoMinutes: z.number().int().min(0).max(525600), actualRtoMinutes: z.number().int().min(0).max(525600),
  notes: z.string().trim().min(10).max(4000),
}).strict();
export const updateDisasterRecoveryPolicySchema = z.object({
  targetRpoMinutes: z.number().int().min(1).max(10080), targetRtoMinutes: z.number().int().min(1).max(10080),
  maxReplicationLagSeconds: z.number().int().min(1).max(86400),
}).strict();
