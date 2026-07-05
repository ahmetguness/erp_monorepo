'use client';

import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const StarterHealthIssueSchema = z.object({
  key: z.enum([
    'missing_tax_rate',
    'negative_stock',
    'overdue_invoice',
    'missing_contact_tax_number',
    'missing_min_stock',
    'missing_invoice_prefix',
    'missing_cash_bank_account',
  ]),
  title: z.string(),
  description: z.string(),
  count: z.coerce.number(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  actionLabel: z.string(),
  href: z.string(),
});

export const StarterHealthScoreSchema = z.object({
  score: z.coerce.number(),
  issues: z.array(StarterHealthIssueSchema),
  generatedAt: z.string(),
});

export type StarterHealthIssue = z.infer<typeof StarterHealthIssueSchema>;
export type StarterHealthScore = z.infer<typeof StarterHealthScoreSchema>;

const StarterHealthResponseSchema = SingleResponseSchema(StarterHealthScoreSchema);

export async function getStarterHealthScore(): Promise<StarterHealthScore> {
  const res = await apiClient.get('/api/starter-health/status');
  return safeParse(StarterHealthResponseSchema, res.data, 'getStarterHealthScore').data;
}
