/** Conservative SQL screening: ambiguous comments/literals also require review. */
export function requiresContractReview(sql: string): boolean {
  return /\b(DROP|TRUNCATE|RENAME|DELETE\s+FROM|SET\s+NOT\s+NULL|ALTER\s+COLUMN\b[^;]*\bTYPE)\b/i.test(sql);
}
