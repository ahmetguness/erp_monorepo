import { prisma } from '../../../lib/prisma.js';
import { decryptTotpSecret, verifiedTotpCounter } from './totp.service.js';

export async function consumeAdminMfa(adminId: string, encryptedSecret: string, code: string, encryptionSecret: string): Promise<boolean> {
  const counter = verifiedTotpCounter(decryptTotpSecret(encryptedSecret, encryptionSecret), code);
  if (counter === null) return false;
  const result = await prisma.adminUser.updateMany({
    where: { id: adminId, isActive: true, mfaSecretEncrypted: encryptedSecret, mfaLastCounter: { lt: counter } },
    data: { mfaLastCounter: counter, mfaVerifiedAt: new Date(), mfaEnabled: true },
  });
  return result.count === 1;
}
