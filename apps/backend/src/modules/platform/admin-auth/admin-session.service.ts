import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../lib/prisma.js';
import type { AdminJwtPayload } from '../admin-access/admin-access.types.js';

export const ADMIN_ACCESS_TTL_SECONDS = 15 * 60;
export const ADMIN_REFRESH_TTL_SECONDS = 8 * 60 * 60;
export const ADMIN_REMEMBER_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_RECENT_MFA_SECONDS = 10 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Bilinmeyen cihaz';
  return userAgent.slice(0, 120);
}

export async function createAdminSession(input: {
  adminId: string; email: string; tokenVersion: number; rememberMe: boolean;
  ipAddress: string | null; userAgent: string | null; jwtSecret: string;
}): Promise<{ accessToken: string; refreshToken: string; refreshMaxAge: number }> {
  const refreshSecret = randomBytes(32).toString('base64url');
  const refreshMaxAge = input.rememberMe ? ADMIN_REMEMBER_REFRESH_TTL_SECONDS : ADMIN_REFRESH_TTL_SECONDS;
  const now = new Date();
  const session = await prisma.adminSession.create({ data: {
    tokenVersion: input.tokenVersion,
    adminUserId: input.adminId, refreshTokenHash: hashToken(refreshSecret), deviceName: deviceName(input.userAgent),
    ipAddress: input.ipAddress, userAgent: input.userAgent, rememberMe: input.rememberMe, mfaVerifiedAt: now,
    expiresAt: new Date(now.getTime() + refreshMaxAge * 1000),
  } });
  const payload: AdminJwtPayload = {
    adminId: input.adminId, email: input.email, role: 'admin', sessionId: session.id,
    tokenVersion: input.tokenVersion, mfaVerifiedAt: now.toISOString(),
  };
  return {
    accessToken: jwt.sign(payload, input.jwtSecret, { expiresIn: ADMIN_ACCESS_TTL_SECONDS }),
    refreshToken: `${session.id}.${refreshSecret}`,
    refreshMaxAge,
  };
}

export async function rotateAdminSession(refreshToken: string, jwtSecret: string) {
  const [sessionId, secret] = refreshToken.split('.');
  if (!sessionId || !secret) return null;
  const session = await prisma.adminSession.findUnique({ where: { id: sessionId }, include: { adminUser: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.adminUser.isActive) return null;
  const expected = Buffer.from(session.refreshTokenHash, 'hex');
  const received = Buffer.from(hashToken(secret), 'hex');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  if (!session.adminUser.mfaEnabled || session.tokenVersion !== session.adminUser.tokenVersion || session.createdAt < session.adminUser.passwordChangedAt) return null;
  const nextSecret = randomBytes(32).toString('base64url');
  const updated = await prisma.adminSession.updateMany({
    where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { refreshTokenHash: hashToken(nextSecret), lastSeenAt: new Date() },
  });
  if (updated.count !== 1) return null;
  const payload: AdminJwtPayload = {
    adminId: session.adminUser.id, email: session.adminUser.email, role: 'admin', sessionId: session.id,
    tokenVersion: session.adminUser.tokenVersion, mfaVerifiedAt: session.mfaVerifiedAt.toISOString(),
  };
  return {
    accessToken: jwt.sign(payload, jwtSecret, { expiresIn: ADMIN_ACCESS_TTL_SECONDS }),
    refreshToken: `${session.id}.${nextSecret}`, rememberMe: session.rememberMe,
    refreshMaxAge: Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export async function revokeAdminSession(sessionId: string, adminId: string): Promise<boolean> {
  const result = await prisma.adminSession.updateMany({ where: { id: sessionId, adminUserId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count > 0;
}

export async function logoutAdminSession(refreshToken: string): Promise<void> {
  const parts = refreshToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return;
  await prisma.adminSession.updateMany({
    where: { id: parts[0], refreshTokenHash: hashToken(parts[1]), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
