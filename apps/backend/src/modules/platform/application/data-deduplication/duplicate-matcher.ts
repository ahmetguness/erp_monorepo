import type { DedupEntity, DedupReason, DedupRecord, DuplicateCandidate } from './data-deduplication.types.js';

const FIELD_WEIGHTS: Record<DedupEntity, Readonly<Record<string, number>>> = {
  contacts: { taxNumber: 0.45, email: 0.25, phone: 0.15, name: 0.15 },
  products: { barcode: 0.55, code: 0.3, name: 0.15 },
  invoices: { number: 0.7, contactName: 0.15, totalGross: 0.15 },
};

export function normalizeIdentity(value: string | number | null | undefined): string {
  return String(value ?? '').toLocaleLowerCase('tr-TR').replaceAll('ı', 'i').replaceAll('ş', 's').replaceAll('ğ', 'g').replaceAll('ü', 'u').replaceAll('ö', 'o').replaceAll('ç', 'c').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftPairs = new Set(Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)));
  const rightPairs = new Set(Array.from({ length: Math.max(0, right.length - 1) }, (_, index) => right.slice(index, index + 2)));
  if (leftPairs.size === 0 || rightPairs.size === 0) return 0;
  const intersection = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  return (2 * intersection) / (leftPairs.size + rightPairs.size);
}

function compare(entity: DedupEntity, left: DedupRecord, right: DedupRecord): DuplicateCandidate | null {
  const reasons: DedupReason[] = [];
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS[entity])) {
    const leftValue = normalizeIdentity(left.values[field]);
    const rightValue = normalizeIdentity(right.values[field]);
    if (!leftValue || !rightValue) continue;
    const ratio = similarity(leftValue, rightValue);
    if (ratio === 1) {
      score += weight;
      reasons.push({ field, strength: 'exact', weight, description: `${field} birebir aynı.` });
    } else if ((field === 'name' || field === 'contactName') && ratio >= 0.78) {
      const contribution = weight * ratio;
      score += contribution;
      reasons.push({ field, strength: 'similar', weight: contribution, description: `${field} benzerliği %${Math.round(ratio * 100)}.` });
    }
  }
  const rounded = Math.round(score * 100) / 100;
  if (rounded < 0.15 || reasons.length === 0) return null;
  const mergeSupported = entity === 'contacts';
  return {
    id: `${entity}:${[left.id, right.id].sort().join(':')}`, entity, left, right, score: rounded,
    risk: rounded >= 0.7 ? 'low' : rounded >= 0.4 ? 'medium' : 'high', reasons, mergeSupported,
    mergeBlockedReason: mergeSupported ? null : entity === 'invoices' ? 'Yasal belgeler fiziksel olarak birleştirilemez; aday manuel incelenmelidir.' : 'Ürün stok, lot ve seri benzersizlikleri nedeniyle otomatik merge kapsamı dışındadır.',
  };
}

export function findDuplicateCandidates(entity: DedupEntity, records: readonly DedupRecord[], threshold = 0.15): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const candidate = compare(entity, records[leftIndex], records[rightIndex]);
      if (candidate && candidate.score >= threshold) candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => right.score - left.score).slice(0, 200);
}
