import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (process.env.CI !== 'true' || !database.endsWith('_ci')) {
  throw new Error('Browser fixture preparation requires CI=true and an isolated *_ci database.');
}

const prisma = new PrismaClient();
async function main(): Promise<void> {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { slug: { in: ['axon-demo', 'axon-starter-demo', 'axon-pro-demo'] } },
      select: { id: true },
    });
    if (tenants.length !== 3) throw new Error('Seeded browser tenants are missing. Run db:seed first.');
    for (const tenant of tenants) {
      await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: 'wizard_completed' } },
        create: { tenantId: tenant.id, key: 'wizard_completed', value: 'true' },
        update: { value: 'true' },
      });
    }
    const users = await prisma.tenantUser.findMany({
      where: { tenantId: { in: tenants.map((tenant) => tenant.id) } },
      select: { userId: true },
    });
    const artifactDir = path.resolve(__dirname, '../../../artifacts/browser');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(path.join(artifactDir, 'initialized-users.json'), JSON.stringify(users.map((user) => user.userId)), 'utf8');
    console.log(`Prepared ${tenants.length} initialized browser tenant(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser fixture preparation failed.');
  process.exitCode = 1;
});
