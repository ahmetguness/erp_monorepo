import type { PlanName } from './plans.js';

export type CheckoutBillingInterval = 'monthly' | 'annual';
export type CheckoutPaymentMethod = 'card' | 'bank';
export interface TenantCheckoutContext {
  tenantId: string;
  companyName: string;
  currentPlan: PlanName;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'ARCHIVED' | 'DELETION_SCHEDULED' | 'DELETED';
  trialEndsAt: string | null;
  subscriptionEnd: string | null;
  isOwner: boolean;
  billingProfile: {
    taxOffice: string | null;
    taxNumber: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string;
  };
  contact: {
    name: string;
    email: string;
    phone: string | null;
  };
}
export interface TenantCheckoutQuote { plan: PlanName; billing: CheckoutBillingInterval; months: 1 | 12; subtotal: number; discount: number; tax: number; total: number; currency: 'TRY'; coupon: { code: string; percent: number } | null; }
export interface CompleteTenantCheckoutInput { plan: PlanName; billing: CheckoutBillingInterval; paymentMethod: CheckoutPaymentMethod; couponCode?: string; idempotencyKey: string; }
export interface TenantCheckoutReceipt { invoiceId: string; status: 'PAID' | 'OPEN'; activated: boolean; subscriptionEnd: string | null; quote: TenantCheckoutQuote; }
