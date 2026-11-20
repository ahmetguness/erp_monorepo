import { FeatureKey, FeatureType, Plan, PrismaClient } from '@prisma/client';
import { PLAN_FEATURE_ROWS } from '@repo/types/plans';

// Integration fixtures expect the deployed plan catalog, not demo/customer data.
async function main(): Promise<void> {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/phase3_dr_ci' || !/^axon-dr-[a-f0-9]{12}$/.test(process.env.DR_OWNER ?? ''))
    throw new Error('Owned integration database required');
  const db = new PrismaClient();
  try {
    const rows = await db.$queryRaw<Array<{ owner: string }>>`SELECT owner FROM axon_dr.identity`;
    if (rows.length !== 1 || rows[0]?.owner !== process.env.DR_OWNER) throw new Error('Integration ownership mismatch');
    await db.planFeature.createMany({ data: PLAN_FEATURE_ROWS.map(row => ({ plan: Plan[row.plan], key: row.key, featureKey: FeatureKey[row.featureKey], type: FeatureType[row.type], value: row.value, isEnabled: row.value !== 'false' })), skipDuplicates: true });
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => { console.error('Owned integration catalog preparation failed'); process.exitCode = 1; });
