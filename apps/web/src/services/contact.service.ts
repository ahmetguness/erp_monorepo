import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const ContactSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  name: z.string(),
  code: z.string().nullable(),
  taxNumber: z.string().nullable(),
  taxOffice: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  notes: z.string().nullable(),
  creditLimit: z.number().nullable(),
  paymentTermDays: z.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AccountEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  date: z.string(),
  debit: z.number(),
  credit: z.number(),
  balance: z.number(),
  description: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  createdAt: z.string(),
});

// ─────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────

export type Contact = z.infer<typeof ContactSchema>;
export type ContactType = Contact['type'];
export type AccountEntry = z.infer<typeof AccountEntrySchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface ContactListParams extends PaginationParams {
  search?: string;
  type?: ContactType;
  isActive?: boolean;
}

export interface CreateContactDTO {
  type: ContactType;
  name: string;
  code?: string;
  taxNumber?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  creditLimit?: number;
  paymentTermDays?: number;
}

export type UpdateContactDTO = Partial<Omit<CreateContactDTO, 'type'>> & { isActive?: boolean };

export interface AccountEntryListParams extends PaginationParams {
  dateFrom?: string;
  dateTo?: string;
}

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

const ContactListSchema = PaginatedResponseSchema(ContactSchema);
const ContactDetailSchema = SingleResponseSchema(
  ContactSchema.extend({
    accountEntries: z.array(AccountEntrySchema).optional(),
  }),
);
const AccountEntryListSchema = PaginatedResponseSchema(AccountEntrySchema);

export async function getContacts(params: ContactListParams) {
  const res = await apiClient.get('/api/contacts', { params });
  return ContactListSchema.parse(res.data);
}

export async function getContactById(id: string) {
  const res = await apiClient.get(`/api/contacts/${id}`);
  return SingleResponseSchema(ContactSchema).parse(res.data).data;
}

export async function createContact(data: CreateContactDTO): Promise<Contact> {
  const res = await apiClient.post('/api/contacts', data);
  return SingleResponseSchema(ContactSchema).parse(res.data).data;
}

export async function updateContact(id: string, data: UpdateContactDTO): Promise<Contact> {
  const res = await apiClient.patch(`/api/contacts/${id}`, data);
  return SingleResponseSchema(ContactSchema).parse(res.data).data;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/api/contacts/${id}`);
}

export async function getAccountEntries(contactId: string, params: AccountEntryListParams) {
  const res = await apiClient.get(`/api/contacts/${contactId}/entries`, { params });
  return AccountEntryListSchema.parse(res.data);
}
