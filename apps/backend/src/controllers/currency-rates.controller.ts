import { Context } from 'hono';

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
};
