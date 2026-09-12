export interface AdminAssuranceSuite {
  name: string;
  command: string;
  verifies: readonly string[];
}

export const ADMIN_ASSURANCE_SUITES: readonly AdminAssuranceSuite[] = [
  { name: 'Kimlik doğrulama ve oturum', command: 'test:admin-auth', verifies: ['MFA', 'refresh rotation', 'replay rejection', 'revocation'] },
  { name: 'Rol ve admin kullanıcı yönetimi', command: 'test:admin-users', verifies: ['positive permission', 'negative permission', 'session revocation', 'last super-admin guard'] },
  { name: 'İki kişi onayı', command: 'test:admin-approval', verifies: ['self-approval rejection', 'permission rejection', 'tenant effect', 'audit'] },
  { name: 'Tenant yaşam döngüsü', command: 'test:tenant-lifecycle', verifies: ['plan/status workflow', 'tenant isolation'] },
  { name: 'Feature rollout', command: 'test:feature-rollouts', verifies: ['versioning', 'approval', 'stop guardrail'] },
  { name: 'Destek oturumu', command: 'test:support-sessions', verifies: ['consent', 'expiry', 'audit'] },
  { name: 'Demo operasyonu', command: 'test:demo-operations', verifies: ['approval', 'idempotency', 'admin identity'] },
  { name: 'Job müdahalesi', command: 'test:operation-interventions', verifies: ['dry-run', 'retry', 'tenant effect', 'audit'] },
  { name: 'Platform audit', command: 'test:platform-audit', verifies: ['hash-chain integrity', 'retention', 'export'] },
  { name: 'API güvenliği', command: 'test:admin-api-safety', verifies: ['idempotency', 'concurrency', 'conflict'] },
] as const;
