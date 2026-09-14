import { z } from 'zod';
import type { CompleteTenantCheckoutInput, TenantCheckoutContext, TenantCheckoutReceipt, TenantCheckoutQuote } from '@repo/types';
import { apiClient } from '@/lib/api-client';

const quoteSchema = z.object({ plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']), billing: z.enum(['monthly', 'annual']), months: z.union([z.literal(1), z.literal(12)]), subtotal: z.number(), discount: z.number(), tax: z.number(), total: z.number(), currency: z.literal('TRY'), coupon: z.object({ code: z.string(), percent: z.number() }).nullable() });
const receiptSchema = z.object({ invoiceId: z.string(), status: z.enum(['PAID', 'OPEN']), activated: z.boolean(), subscriptionEnd: z.string().nullable(), quote: quoteSchema });
const contextSchema = z.object({
  tenantId: z.string(),
  companyName: z.string(),
  currentPlan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED', 'DELETION_SCHEDULED', 'DELETED']),
  trialEndsAt: z.string().nullable(),
  subscriptionEnd: z.string().nullable(),
  isOwner: z.boolean(),
  billingProfile: z.object({ taxOffice: z.string().nullable(), taxNumber: z.string().nullable(), email: z.string(), phone: z.string().nullable(), address: z.string().nullable(), city: z.string().nullable(), country: z.string() }),
  contact: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() }),
});
export async function getTenantCheckoutContext(): Promise<TenantCheckoutContext> { const response = await apiClient.get('/api/checkout/context'); return contextSchema.parse(response.data.data); }
export async function quoteTenantCheckout(input: Pick<CompleteTenantCheckoutInput, 'plan' | 'billing' | 'couponCode'>): Promise<TenantCheckoutQuote> { const response = await apiClient.post('/api/checkout/quote', input); return quoteSchema.parse(response.data.data); }
export async function completeTenantCheckout(input: CompleteTenantCheckoutInput): Promise<TenantCheckoutReceipt> { const response = await apiClient.post('/api/checkout/complete', input); return receiptSchema.parse(response.data.data); }
