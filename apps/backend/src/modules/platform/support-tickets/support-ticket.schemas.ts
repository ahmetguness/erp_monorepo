import { z } from 'zod';
import {
  PLATFORM_TICKET_CATEGORIES,
  PLATFORM_TICKET_PRIORITIES,
  PLATFORM_TICKET_STATUSES,
} from '@repo/types';

export const listTenantTicketsQuerySchema = z.object({
  status: z.enum(PLATFORM_TICKET_STATUSES).optional(),
  category: z.enum(PLATFORM_TICKET_CATEGORIES).optional(),
  search: z.string().trim().min(1).optional(),
});

export const listAdminTicketsQuerySchema = z.object({
  status: z.enum(PLATFORM_TICKET_STATUSES).optional(),
  priority: z.enum(PLATFORM_TICKET_PRIORITIES).optional(),
  category: z.enum(PLATFORM_TICKET_CATEGORIES).optional(),
  tenantId: z.string().trim().min(1).optional(),
  assignedAdminId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export const createSupportTicketSchema = z.object({
  title: z.string().trim().min(5, 'Başlık en az 5 karakter olmalıdır').max(200, 'Başlık en fazla 200 karakter olabilir'),
  description: z.string().trim().min(10, 'Açıklama en az 10 karakter olmalıdır').max(10000, 'Açıklama çok uzun'),
  category: z.enum(PLATFORM_TICKET_CATEGORIES).default('TECHNICAL'),
  priority: z.enum(PLATFORM_TICKET_PRIORITIES).default('MEDIUM'),
}).strict();

export const addTicketMessageSchema = z.object({
  message: z.string().trim().min(2, 'Mesaj en az 2 karakter olmalıdır').max(10000, 'Mesaj çok uzun'),
  isInternal: z.boolean().optional().default(false),
}).strict();

export const updateTicketAdminSchema = z.object({
  status: z.enum(PLATFORM_TICKET_STATUSES).optional(),
  priority: z.enum(PLATFORM_TICKET_PRIORITIES).optional(),
  assignedAdminId: z.string().nullable().optional(),
}).strict();
