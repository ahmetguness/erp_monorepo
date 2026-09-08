import { z } from 'zod';
import { ADMIN_ROLE_KEYS } from '@repo/types';

const roles = z.array(z.enum(ADMIN_ROLE_KEYS)).min(1).max(ADMIN_ROLE_KEYS.length).refine((values) => new Set(values).size === values.length, 'Roller tekrar edemez.');
export const inviteAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), roles,
}).strict();
export const updateAdminSchema = z.object({ roles, isActive: z.boolean() }).strict();
export const acceptAdminInviteSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Şifre en fazla 72 bayt olabilir.'),
}).strict();
