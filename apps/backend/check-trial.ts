import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const tenants = await p.tenant.findMany({
    where: { status: 'TRIAL' },
    select: { slug: true, status: true, trialEndsAt: true },
  });
  console.log(JSON.stringify(tenants, null, 2));
  await p.$disconnect();
}

main();
