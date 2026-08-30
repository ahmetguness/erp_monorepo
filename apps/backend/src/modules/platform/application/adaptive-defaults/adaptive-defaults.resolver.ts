import type { AdaptiveDefaultCandidate, AdaptiveDefaultField, AdaptiveDefaultSource, AdaptiveDefaultSuggestion } from './adaptive-defaults.types.js';

const MIN_LEARNED_SAMPLES = 3;
const AUTO_APPLY_CONFIDENCE = 0.8;

const SOURCE_LABELS: Record<AdaptiveDefaultSource, string> = {
  contact: 'Bu cariyle yaptığınız işlemler',
  user: 'Kendi son işlemleriniz',
  role: 'Aynı roldeki kullanıcıların işlemleri',
  tenant: 'Şirketinizin işlem geçmişi',
  policy: 'Şirket varsayılanı',
};

export function resolveCandidate(
  field: AdaptiveDefaultField,
  source: AdaptiveDefaultSource,
  candidates: readonly AdaptiveDefaultCandidate[],
): AdaptiveDefaultSuggestion | null {
  const sampleSize = candidates.reduce((sum, candidate) => sum + candidate.count, 0);
  if (sampleSize === 0 || (source !== 'policy' && sampleSize < MIN_LEARNED_SAMPLES)) return null;
  const winner = [...candidates].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))[0];
  if (!winner) return null;
  const confidence = Number((winner.count / sampleSize).toFixed(2));
  return {
    field,
    value: winner.value,
    confidence,
    sampleSize,
    source,
    reason: `${SOURCE_LABELS[source]} içinde ${winner.count}/${sampleSize} kez kullanıldı.`,
    autoApplicable: source !== 'policy' && confidence >= AUTO_APPLY_CONFIDENCE,
  };
}
