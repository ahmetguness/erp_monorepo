import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface PasswordResetToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createPasswordResetToken(
  ttlMs = 60 * 60 * 1000,
): PasswordResetToken {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashPasswordResetToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

export function verifyPasswordResetToken(
  storedHash: string | null,
  rawToken: string,
): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const incomingHash = hashPasswordResetToken(rawToken);
  return timingSafeEqual(
    Buffer.from(storedHash, "hex"),
    Buffer.from(incomingHash, "hex"),
  );
}
