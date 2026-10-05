import { CurrencyRateSource } from '@prisma/client';
import { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireTenantId } from '../../../../utils/context.js';
import { observedFetch } from '../../../shared/index.js';

interface TcmbCurrency {
  code: string;
  name: string;
  unit: number;
  forexBuying: number;
  forexSelling: number;
  banknoteBuying: number;
  banknoteSelling: number;
  crossRateUSD: number | null;
}

function parseXml(xml: string): { date: string; currencies: TcmbCurrency[] } {
  const dateMatch = xml.match(/Tarih="([^"]+)"/);
  const date = dateMatch ? dateMatch[1] : '';

  const currencies: TcmbCurrency[] = [];
  const currencyRegex = /<Currency[^>]*Kod="([^"]+)"[^>]*>([\s\S]*?)<\/Currency>/g;
  let match: RegExpExecArray | null;

  while ((match = currencyRegex.exec(xml)) !== null) {
    const code = match[1];
    const block = match[2];

    const get = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    const forexBuying = parseFloat(get('ForexBuying'));
    if (isNaN(forexBuying) || forexBuying === 0) continue;

    currencies.push({
      code,
      name: get('Isim'),
      unit: parseInt(get('Unit'), 10) || 1,
      forexBuying,
      forexSelling: parseFloat(get('ForexSelling')) || 0,
      banknoteBuying: parseFloat(get('BanknoteBuying')) || 0,
      banknoteSelling: parseFloat(get('BanknoteSelling')) || 0,
      crossRateUSD: parseFloat(get('CrossRateUSD')) || null,
    });
  }

  return { date, currencies };
}

let cache: { data: ReturnType<typeof parseXml>; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCurrencyDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function parseCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export const CurrencyRatesController = {
  async getTcmbRates(c: Context): Promise<Response> {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_TTL) {
      return c.json({ data: cache.data });
    }

    try {
      const res = await observedFetch('https://www.tcmb.gov.tr/kurlar/today.xml');
      if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parseXml(xml);
      cache = { data: parsed, fetchedAt: now };
      return c.json({ data: parsed });
    } catch (err) {
      if (cache) return c.json({ data: cache.data });
      return c.json({ error: 'TCMB kurları alınamadı.' }, 502);
    }
  },

  /**
   * POST /api/currency-rates
   * Manuel kur girişi — tenant bazlı belirli bir tarih için kur kaydeder.
   */
  async createRate(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body: unknown = await c.req.json();
    if (!isRecord(body)) return c.json(new ValidationError('Geçersiz istek gövdesi.').toJSON(), 400);
    const currencyCode = parseCurrencyCode(body.currencyCode);
    const date = parseCurrencyDate(body.date);
    const numericRate = body.rate;
    if (!currencyCode || !date || typeof numericRate !== 'number' || !Number.isFinite(numericRate)) {
      return c.json(new ValidationError('Geçerli currencyCode, rate ve date zorunludur.').toJSON(), 400);
    }
    if (numericRate <= 0 || numericRate >= 1_000_000_000_000) {
      return c.json(new ValidationError('Kur değeri geçerli aralıkta olmalıdır.').toJSON(), 400);
    }
    if (body.source !== undefined && body.source !== CurrencyRateSource.MANUAL) {
      return c.json(new ValidationError('Manuel kur endpointinde source MANUAL olmalıdır.').toJSON(), 400);
    }

    const rate = await prisma.currencyRate.upsert({
      where: {
        tenantId_currencyCode_date: {
          tenantId,
          currencyCode,
          date,
        },
      },
      create: {
        tenantId,
        currencyCode,
        rate: numericRate,
        date,
        source: CurrencyRateSource.MANUAL,
      },
      update: {
        rate: numericRate,
        source: CurrencyRateSource.MANUAL,
      },
    });

    return c.json({ data: rate }, 201);
  },

  /**
   * GET /api/currency-rates
   * Tenant'ın kayıtlı kurlarını listeler.
   */
  async listRates(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const rawCurrencyCode = c.req.query('currencyCode');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    const currencyCode = rawCurrencyCode ? parseCurrencyCode(rawCurrencyCode) : null;
    if (rawCurrencyCode && !currencyCode) return c.json(new ValidationError('Geçersiz currencyCode.').toJSON(), 400);
    const from = dateFrom ? parseCurrencyDate(dateFrom) : null;
    const to = dateTo ? parseCurrencyDate(dateTo) : null;
    if ((dateFrom && !from) || (dateTo && !to) || (from && to && from > to)) {
      return c.json(new ValidationError('Geçersiz tarih aralığı.').toJSON(), 400);
    }

    const rates = await prisma.currencyRate.findMany({
      where: {
        tenantId,
        ...(currencyCode && { currencyCode }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(from && { gte: from }),
                ...(to && { lte: to }),
              },
            }
          : {}),
      },
      orderBy: [{ currencyCode: 'asc' }, { date: 'desc' }],
      take: 200,
    });

    return c.json({ data: rates });
  },
};
