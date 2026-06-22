export type BypassStatus = 'active' | 'retired';

export interface TypeSafetyBypassAllowlistEntry {
  file: string;
  snippet: string;
  reason: string;
  owner: string;
  status: BypassStatus;
}

export const TYPE_SAFETY_BYPASS_ALLOWLIST: readonly TypeSafetyBypassAllowlistEntry[] = [
  {
    file: 'apps/backend/src/lib/prisma.ts',
    snippet: 'unknown as',
    reason: 'Historical Prisma singleton typing exception; currently retired because globalThis is typed with declare global.',
    owner: 'platform',
    status: 'retired',
  },
  {
    file: 'apps/backend/src/utils/generate-number.ts',
    snippet: 'unknown as',
    reason: 'Historical dynamic Prisma delegate exception; currently retired because document number checks use an explicit model switch.',
    owner: 'platform',
    status: 'retired',
  },
];
