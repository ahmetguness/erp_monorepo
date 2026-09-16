import { describe, it, expect } from 'vitest';
import {
  parseAssistantResponse,
  PROMPT_CATEGORIES,
} from '../../services/chat.service';

describe('chat.service AXON Copilot Assistant Parser', () => {
  it('should parse clean text and suggestions from structured response', () => {
    const raw = `Şirketinizin vadesi geçmiş toplam 3 adet faturası bulunmaktadır.
---
{"suggestions":["Faturaları göster","Müşterilere SMS hatırlatması yap"]}`;

    const parsed = parseAssistantResponse(raw);

    expect(parsed.cleanText).toBe('Şirketinizin vadesi geçmiş toplam 3 adet faturası bulunmaktadır.');
    expect(parsed.suggestions).toEqual([
      'Faturaları göster',
      'Müşterilere SMS hatırlatması yap',
    ]);
  });

  it('should detect finance action entity when overdue invoices are mentioned', () => {
    const raw = 'Şirketinizde 12.500 TL tutarında vadesi geçmiş fatura bulunmaktadır.';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.actionEntities.some((a) => a.targetScreen === 'Finance')).toBe(true);
    const financeAction = parsed.actionEntities.find((a) => a.targetScreen === 'Finance');
    expect(financeAction?.badge).toBe('Finans');
  });

  it('should detect inventory action entity when product code or stock is mentioned', () => {
    const raw = 'PRD-1029 kodlu rulman için kritik stok uyarısı: depoda sadece 3 adet kaldı.';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.actionEntities.some((a) => a.targetScreen === 'InventoryTab')).toBe(true);
  });

  it('should detect sales action entity when order code is mentioned', () => {
    const raw = 'SIP-2024-004 numaralı sipariş başarıyla oluşturuldu ve onay bekliyor.';
    const parsed = parseAssistantResponse(raw);

    expect(parsed.actionEntities.some((a) => a.targetScreen === 'SalesTab')).toBe(true);
  });

  it('should provide predefined prompt categories with suggestions', () => {
    expect(PROMPT_CATEGORIES.length).toBeGreaterThan(0);
    const financeCat = PROMPT_CATEGORIES.find((c) => c.id === 'finance');
    expect(financeCat).toBeDefined();
    expect(financeCat?.prompts.length).toBeGreaterThan(0);
  });

  it('should handle empty or null string gracefully without crashing', () => {
    const parsed = parseAssistantResponse('');
    expect(parsed.cleanText).toBe('');
    expect(parsed.suggestions).toHaveLength(0);
    expect(parsed.actionEntities).toHaveLength(0);
  });
});
