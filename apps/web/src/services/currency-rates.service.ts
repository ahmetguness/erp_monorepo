import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const TcmbCurrencySchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.coerce.number(),
  forexBuying: z.coerce.number(),
  forexSelling: z.coerce.number(),
  banknoteBuying: z.coerce.number(),
  banknoteSelling: z.coerce.number(),
  crossRateUSD: z.coerce.number().nullable(),
});

export const TcmbRatesSchema = z.object({
  date: z.string(),
  currencies: z.array(TcmbCurrencySchema),
});

export const CurrencyRateSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  currencyCode: z.string(),
  rate: z.coerce.number(),
  date: z.string(),
  source: z.string(),
});

export type TcmbCurrency = z.infer<typeof TcmbCurrencySchema>;
export type TcmbRates = z.infer<typeof TcmbRatesSchema>;
export type CurrencyRate = z.infer<typeof CurrencyRateSchema>;

export interface CurrencyRateListParams {
  currencyCode?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateCurrencyRateDTO {
  currencyCode: string;
  rate: number;
  date: string;
  source?: 'MANUAL' | 'TCMB' | 'API';
}

export async function getTcmbRates(): Promise<TcmbRates> {
  const res = await apiClient.get('/api/currency-rates/tcmb');
  return safeParse(SingleResponseSchema(TcmbRatesSchema), res.data, 'getTcmbRates').data;
}

export async function getCurrencyRates(params?: CurrencyRateListParams): Promise<CurrencyRate[]> {
  const res = await apiClient.get('/api/currency-rates', { params });
  return safeParse(SingleResponseSchema(z.array(CurrencyRateSchema)), res.data, 'getCurrencyRates').data;
}

export async function createCurrencyRate(data: CreateCurrencyRateDTO): Promise<CurrencyRate> {
  const res = await apiClient.post('/api/currency-rates', data);
  return safeParse(SingleResponseSchema(CurrencyRateSchema), res.data, 'createCurrencyRate').data;
}
