/**
 * Marketplace Mock Registry
 *
 * Hangi mock'ların başlatılacağını MARKETPLACE_MOCK env var'ı belirler.
 * Virgülle ayrılmış kanal adları: trendyol, hepsiburada, n11, ...
 *
 * Örnekler:
 *   MARKETPLACE_MOCK=trendyol
 *   MARKETPLACE_MOCK=trendyol,hepsiburada
 *   MARKETPLACE_MOCK=all
 *
 * Geriye uyumluluk: TRENDYOL_MOCK=true da çalışmaya devam eder.
 */

import { logger } from '../lib/logger';
import { startTrendyolMock, stopTrendyolMock, MOCK_PORT as TRENDYOL_PORT } from './trendyol.mock';

export interface MockInfo {
  channel: string;
  port: number;
  stop: () => void;
}

const activeMocks: MockInfo[] = [];

function getEnabledChannels(): string[] {
  // MARKETPLACE_MOCK=trendyol,hepsiburada veya MARKETPLACE_MOCK=all
  const marketplaceMock = process.env.MARKETPLACE_MOCK?.toLowerCase();
  if (marketplaceMock) {
    if (marketplaceMock === 'all') return ['trendyol', 'hepsiburada', 'n11', 'amazon', 'ciceksepeti'];
    return marketplaceMock.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Geriye uyumluluk: TRENDYOL_MOCK=true
  if (process.env.TRENDYOL_MOCK === 'true') return ['trendyol'];

  if (process.env.NODE_ENV !== 'production') return ['trendyol'];

  return [];
}

export function startMarketplaceMocks(): void {
  const channels = getEnabledChannels();
  if (channels.length === 0) return;

  for (const channel of channels) {
    switch (channel) {
      case 'trendyol':
        startTrendyolMock();
        activeMocks.push({ channel: 'TRENDYOL', port: TRENDYOL_PORT, stop: stopTrendyolMock });
        break;

      // Diğer kanallar eklendiğinde buraya:
      // case 'hepsiburada':
      //   startHepsiburadaMock();
      //   activeMocks.push({ channel: 'HEPSIBURADA', port: HEPSIBURADA_PORT, stop: stopHepsiburadaMock });
      //   break;

      default:
        logger.warn(`[MockRegistry] Bilinmeyen kanal: ${channel} — atlanıyor`);
    }
  }

  if (activeMocks.length > 0) {
    logger.info(`[MockRegistry] ${activeMocks.length} mock aktif: ${activeMocks.map((m) => m.channel).join(', ')}`);
  }
}

export function stopAllMocks(): void {
  for (const mock of activeMocks) {
    mock.stop();
    logger.info(`[MockRegistry] ${mock.channel} mock durduruldu`);
  }
  activeMocks.length = 0;
}

export function getActiveMocks(): MockInfo[] {
  return [...activeMocks];
}
