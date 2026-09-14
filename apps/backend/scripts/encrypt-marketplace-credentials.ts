import { prisma } from "../src/lib/prisma.js";
import { encrypt, isEncryptedPayload } from "../src/utils/encryption.js";
import { runWithTenantIsolationBypass } from "../src/lib/tenant-isolation-context.js";

interface CredentialUpdate {
  apiKey?: string;
  apiSecret?: string;
}

function encryptedUpdate(
  apiKey: string | null,
  apiSecret: string | null,
): CredentialUpdate {
  return {
    ...(apiKey && !isEncryptedPayload(apiKey)
      ? { apiKey: encrypt(apiKey) }
      : {}),
    ...(apiSecret && !isEncryptedPayload(apiSecret)
      ? { apiSecret: encrypt(apiSecret) }
      : {}),
  };
}

async function main(): Promise<void> {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY marketplace credential migration için zorunludur.",
    );
  }

  const { integrations, migratedCount } = await runWithTenantIsolationBypass(
    "credential-migration",
    async () => {
      const integrations = await prisma.marketplaceIntegration.findMany({
        select: { id: true, apiKey: true, apiSecret: true },
      });
      let migratedCount = 0;
      for (const integration of integrations) {
        const data = encryptedUpdate(integration.apiKey, integration.apiSecret);
        if (Object.keys(data).length === 0) continue;
        await prisma.marketplaceIntegration.update({
          where: { id: integration.id },
          data,
        });
        migratedCount += 1;
      }
      return { integrations, migratedCount };
    },
  );

  console.log(
    `Marketplace credential migration complete: ${migratedCount}/${integrations.length} record(s) updated.`,
  );
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown migration error";
    console.error(`Marketplace credential migration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
