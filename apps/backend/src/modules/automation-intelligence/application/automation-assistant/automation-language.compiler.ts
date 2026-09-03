import { ValidationError } from "../../../../errors/index.js";
import type { AutomationAssistantDraft } from "./automation-assistant.types.js";

interface IntentRecipe {
  terms: string[];
  interpretation: string;
  confidence: number;
  draft: AutomationAssistantDraft;
}

const RECIPES: readonly IntentRecipe[] = [
  {
    terms: ["stok", "az", "minimum", "kritik"],
    interpretation:
      "Minimum seviyenin altındaki ürünler için takip görevi oluştur.",
    confidence: 0.94,
    draft: {
      name: "Kritik stok takibi",
      description: "Minimum stok altındaki ürünleri takip eder.",
      module: "inventory",
      trigger: "LOW_STOCK",
      action: "CREATE_TASK",
      conditions: { minStockRequired: true },
      actionConfig: { priorityPolicy: "deficit_based" },
      isActive: false,
    },
  },
  {
    terms: ["vadesi", "geçen", "gecen", "fatura", "tahsilat"],
    interpretation: "Vadesi geçen satış faturaları için bildirim hazırla.",
    confidence: 0.95,
    draft: {
      name: "Geciken tahsilat bildirimi",
      description: "Vadesi geçen satış faturalarını sorumlulara bildirir.",
      module: "invoicing",
      trigger: "OVERDUE_INVOICE",
      action: "CREATE_NOTIFICATION",
      conditions: { invoiceType: "SALES" },
      actionConfig: { audience: "assigned_or_owner", channel: "in_app" },
      isActive: false,
    },
  },
  {
    terms: ["yüksek", "yuksek", "tutar", "fatura", "onay"],
    interpretation: "Yüksek tutarlı faturalar için onay kontrolü başlat.",
    confidence: 0.91,
    draft: {
      name: "Yuksek tutarli fatura onayi",
      description: "100.000 TRY üzerindeki faturaları onay kontrolüne taşır.",
      module: "approvals",
      trigger: "HIGH_VALUE_INVOICE",
      action: "REQUEST_APPROVAL",
      conditions: { minAmount: 100000, currency: "TRY" },
      actionConfig: { approvalScope: "finance_review" },
      isActive: false,
    },
  },
  {
    terms: ["marj", "kar", "kâr", "düşük", "dusuk"],
    interpretation:
      "Düşük kâr marjlı ürünler için fiyat kontrol görevi oluştur.",
    confidence: 0.9,
    draft: {
      name: "Dusuk marj kontrolu",
      description: "Marjı yüzde 12 altındaki ürünleri izler.",
      module: "inventory",
      trigger: "LOW_MARGIN",
      action: "CREATE_TASK",
      conditions: { maxMarginRate: 0.12 },
      actionConfig: { priorityPolicy: "margin_based" },
      isActive: false,
    },
  },
  {
    terms: ["çek", "cek", "senet", "vade"],
    interpretation:
      "Vadesi yaklaşan çek ve senetler için takip görevi oluştur.",
    confidence: 0.93,
    draft: {
      name: "Cek senet vade takibi",
      description: "Yedi gün içinde vadesi gelen kayıtları izler.",
      module: "accounting",
      trigger: "CHECK_DUE_SOON",
      action: "CREATE_TASK",
      conditions: { dueInDays: 7 },
      actionConfig: { priorityPolicy: "due_date_based" },
      isActive: false,
    },
  },
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function compileAutomationIntent(
  prompt: string,
): Pick<IntentRecipe, "interpretation" | "confidence" | "draft"> {
  const normalized = normalize(prompt);
  if (normalized.length < 5)
    throw new ValidationError(
      "Otomasyon hedefinizi iş dilinde biraz daha ayrıntılı yazın.",
    );

  const ranked = RECIPES.map((recipe) => ({
    recipe,
    score: recipe.terms.filter((term) => normalized.includes(term)).length,
  })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score === 0) {
    throw new ValidationError(
      "Bu hedef güvenli bir otomasyon tarifine dönüştürülemedi. Hazır örneklerden birini deneyin.",
    );
  }
  return {
    interpretation: best.recipe.interpretation,
    confidence: best.recipe.confidence,
    draft: best.recipe.draft,
  };
}
