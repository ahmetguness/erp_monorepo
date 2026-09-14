import bcrypt from "bcryptjs";

export const PASSWORD_HASH_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_COST);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function getBcryptCost(passwordHash: string): number | null {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(passwordHash);
  if (!match?.[1]) return null;
  const cost = Number.parseInt(match[1], 10);
  return Number.isInteger(cost) ? cost : null;
}

export function passwordHashNeedsUpgrade(passwordHash: string): boolean {
  const cost = getBcryptCost(passwordHash);
  return cost === null || cost < PASSWORD_HASH_COST;
}
