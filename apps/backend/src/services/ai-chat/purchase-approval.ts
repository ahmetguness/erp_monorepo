export interface ToolApprovalContext { turnId: string; humanApproved: boolean }
export interface ToolExecutionContext extends ToolApprovalContext { userId: string }
interface Preview { fingerprint: string; turnId: string; expiresAt: number }
const previews = new Map<string, Preview>();
const TTL_MS = 5 * 60_000;
export function isExplicitToolApproval(message: string): boolean {
  return /^(evet|onaylıyorum|onayliyorum|onayla|oluştur|olustur|onayla ve tasla[ğg][ıi] olu[şs]tur)[.!]?$/u.test(message.trim().toLocaleLowerCase('tr-TR'));
}
export function rememberPurchasePreview(key: string, fingerprint: string, context: ToolApprovalContext): void {
  for (const [id, preview] of previews) if (preview.expiresAt <= Date.now()) previews.delete(id);
  if (previews.size >= 2000) { const oldest = previews.keys().next().value; if (oldest) previews.delete(oldest); }
  previews.set(key, { fingerprint, turnId: context.turnId, expiresAt: Date.now() + TTL_MS });
}
export function consumePurchaseApproval(key: string, fingerprint: string, context?: ToolApprovalContext): boolean {
  const preview = previews.get(key);
  if (!context?.humanApproved || !preview || preview.expiresAt <= Date.now() || preview.turnId === context.turnId || preview.fingerprint !== fingerprint) return false;
  previews.delete(key);
  return true;
}
