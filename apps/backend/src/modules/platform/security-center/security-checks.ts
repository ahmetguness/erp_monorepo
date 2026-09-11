import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";
import { getStorageStatus } from "../../../services/storage.service.js";

export type CheckStatus = "PASS" | "WARN" | "FAIL";
export type CheckSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface SecurityCheckResult {
  key: string; title: string; category: string; severity: CheckSeverity;
  status: CheckStatus; remediation: string; evidence: string[];
}

const present = (name: string): boolean => Boolean(process.env[name]?.trim());
const booleanFlag = (name: string): boolean => process.env[name]?.toLowerCase() === "true";
function ageInDays(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return null;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}
function nonNegativeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function ageCheck(key: string, title: string, envName: string): SecurityCheckResult {
  const age = ageInDays(process.env[envName]);
  return {
    key, title, category: "KEY_MANAGEMENT", severity: "HIGH",
    status: age === null ? "WARN" : age <= 90 ? "PASS" : "FAIL",
    remediation: `${envName} tarihini anahtar rotasyon sürecinde güncelleyin; anahtarları en geç 90 günde bir döndürün.`,
    evidence: [age === null ? "Rotasyon tarihi kanıtı bulunamadı" : `Anahtar yaşı: ${age} gün`],
  };
}

export async function collectSecurityChecks(): Promise<SecurityCheckResult[]> {
  const production = process.env.NODE_ENV === "production";
  const publicUrl = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  const [adminTotal, adminMfa, missingWebhookSecrets] = await Promise.all([
    prisma.adminUser.count({ where: { isActive: true } }),
    prisma.adminUser.count({ where: { isActive: true, mfaEnabled: true } }),
    runWithTenantIsolationBypass("admin-console", async () => {
      return await prisma.marketplaceIntegration.count({
        where: { isActive: true, OR: [{ apiSecret: null }, { apiSecret: "" }] },
      });
    }),
  ]);
  const storage = getStorageStatus();
  const restoreAge = ageInDays(process.env.LAST_RESTORE_TEST_AT);
  const dependencyCritical = nonNegativeInteger(process.env.DEPENDENCY_AUDIT_CRITICAL_COUNT);
  const mfaCoverage = adminTotal === 0 ? 100 : Math.round((adminMfa / adminTotal) * 100);

  return [
    {
      key: "transport:tls", title: "TLS zorunluluğu", category: "TRANSPORT", severity: "CRITICAL",
      status: publicUrl?.startsWith("https://") ? "PASS" : production ? "FAIL" : "WARN",
      remediation: "Platform URL'sini HTTPS olarak yayınlayın ve HTTP isteklerini HTTPS'e yönlendirin.",
      evidence: [publicUrl?.startsWith("https://") ? "HTTPS uç noktası yapılandırılmış" : "HTTPS yapılandırma kanıtı bulunamadı"],
    },
    {
      key: "http:csp", title: "Content Security Policy", category: "HTTP_SECURITY", severity: "HIGH",
      status: present("CONTENT_SECURITY_POLICY") ? "PASS" : production ? "FAIL" : "WARN",
      remediation: "Nonce tabanlı, object-src 'none' içeren bir CSP başlığı yapılandırın.",
      evidence: [present("CONTENT_SECURITY_POLICY") ? "CSP politikası tanımlı" : "CSP politikası tanımlı değil"],
    },
    {
      key: "http:cors", title: "CORS izin listesi", category: "HTTP_SECURITY", severity: "HIGH",
      status: allowedOrigins && !allowedOrigins.split(",").map((item) => item.trim()).includes("*") ? "PASS" : production ? "FAIL" : "WARN",
      remediation: "ALLOWED_ORIGINS değerini açık ve güvenilir origin listesiyle sınırlandırın.",
      evidence: [allowedOrigins ? `Tanımlı origin sayısı: ${allowedOrigins.split(",").length}` : "Origin izin listesi bulunamadı"],
    },
    {
      key: "http:cookie", title: "Güvenli oturum cookie politikası", category: "HTTP_SECURITY", severity: "CRITICAL",
      status: !production || booleanFlag("COOKIE_SECURE") ? "PASS" : "FAIL",
      remediation: "Production cookie'lerinde Secure, HttpOnly ve SameSite niteliklerini zorunlu tutun.",
      evidence: [production ? `Secure cookie zorunluluğu: ${booleanFlag("COOKIE_SECURE") ? "etkin" : "eksik"}` : "Geliştirme ortamı"],
    },
    ageCheck("key:application", "Uygulama anahtarı yaşı", "KEY_ROTATED_AT"),
    ageCheck("key:admin-jwt", "Admin JWT anahtarı yaşı", "ADMIN_JWT_ROTATED_AT"),
    {
      key: "identity:admin-mfa", title: "Admin MFA kapsamı", category: "IDENTITY", severity: "CRITICAL",
      status: mfaCoverage === 100 ? "PASS" : mfaCoverage >= 90 ? "WARN" : "FAIL",
      remediation: "Tüm aktif admin hesaplarında MFA kurulumunu tamamlayın.",
      evidence: [`MFA kapsamı: %${mfaCoverage}`, `Aktif admin: ${adminTotal}`],
    },
    {
      key: "dependencies:vulnerabilities", title: "Bağımlılık zafiyetleri", category: "SUPPLY_CHAIN", severity: "CRITICAL",
      status: dependencyCritical === null ? "WARN" : dependencyCritical === 0 ? "PASS" : "FAIL",
      remediation: "CI üzerinde bağımlılık taraması çalıştırın ve kritik zafiyetleri sürüm yükselterek giderin.",
      evidence: [dependencyCritical === null ? "Güncel tarama kanıtı bulunamadı" : `Kritik zafiyet sayısı: ${dependencyCritical}`],
    },
    {
      key: "backup:encryption", title: "Yedek şifreleme", category: "BACKUP", severity: "CRITICAL",
      status: booleanFlag("BACKUP_ENCRYPTION_ENABLED") ? "PASS" : production ? "FAIL" : "WARN",
      remediation: "Yedekleri ayrı KMS anahtarıyla at-rest şifreleyin ve anahtar erişimini sınırlandırın.",
      evidence: [`Yedek şifreleme: ${booleanFlag("BACKUP_ENCRYPTION_ENABLED") ? "doğrulandı" : "doğrulanamadı"}`],
    },
    {
      key: "backup:restore-test", title: "Restore tatbikatı", category: "BACKUP", severity: "HIGH",
      status: restoreAge === null ? "WARN" : restoreAge <= 90 ? "PASS" : "FAIL",
      remediation: "İzole ortamda restore tatbikatı yapın ve LAST_RESTORE_TEST_AT kanıtını güncelleyin.",
      evidence: [restoreAge === null ? "Restore testi kanıtı bulunamadı" : `Son restore testi: ${restoreAge} gün önce`],
    },
    {
      key: "webhook:signature", title: "Webhook imza doğrulaması", category: "INTEGRATIONS", severity: "CRITICAL",
      status: missingWebhookSecrets === 0 ? "PASS" : "FAIL",
      remediation: "Aktif entegrasyonların webhook secret'larını tanımlayın ve her istekte imzayı doğrulayın.",
      evidence: [`Secret eksik aktif entegrasyon: ${missingWebhookSecrets}`],
    },
    {
      key: "storage:access", title: "Storage erişim kontrolü", category: "STORAGE", severity: "HIGH",
      status: storage.driver === "s3" && storage.ready && booleanFlag("STORAGE_PUBLIC_ACCESS_DISABLED") ? "PASS" : production ? "FAIL" : "WARN",
      remediation: "Private bucket, public-access block ve süreli erişim bağlantıları kullanın.",
      evidence: [`Storage sürücüsü: ${storage.driver}`, `Yapılandırma hazır: ${storage.ready ? "evet" : "hayır"}`, `Public erişim kapalı: ${booleanFlag("STORAGE_PUBLIC_ACCESS_DISABLED") ? "evet" : "doğrulanamadı"}`],
    },
  ];
}
