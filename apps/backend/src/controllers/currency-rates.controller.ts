import { Context } from 'hono';
import { CurrencyRateSource } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';

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

export const CurrencyRatesController = {
  async getTcmbRates(c: Context): Promise<Response> {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_TTL) {
      return c.json({ data: cache.data });
    }

    try {
      const res = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml');
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

    const body = await c.req.json<{
      currencyCode: string;
      rate: number;
      date: string;
      source?: CurrencyRateSource;
    }>();

    if (!body.currencyCode || !body.rate || !body.date) {
      return c.json(new ValidationError('currencyCode, rate ve date zorunludur.').toJSON(), 400);
    }

    if (body.rate <= 0) {
      return c.json(new ValidationError('Kur değeri 0\'dan büyük olmalıdır.').toJSON(), 400);
    }

    const rate = await prisma.currencyRate.upsert({
      where: {
        tenantId_currencyCode_date: {
          tenantId,
          currencyCode: body.currencyCode.toUpperCase(),
          date: new Date(body.date),
        },
      },
      create: {
        tenantId,
        currencyCode: body.currencyCode.toUpperCase(),
        rate: body.rate,
        date: new Date(body.date),
        source: body.source ?? CurrencyRateSource.MANUAL,
      },
      update: {
        rate: body.rate,
        source: body.source ?? CurrencyRateSource.MANUAL,
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

    const currencyCode = c.req.query('currencyCode');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    const rates = await prisma.currencyRate.findMany({
      where: {
        tenantId,
        ...(currencyCode && { currencyCode: currencyCode.toUpperCase() }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
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
