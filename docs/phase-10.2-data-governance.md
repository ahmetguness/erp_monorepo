# Faz 10.2 — Veri yönetişimi ve uyumluluk

19–20 Kasım 2026. **Karar: CONDITIONAL PASS.** Yerel teknik kontroller geçti;
hukuki kararlar ve aşağıdaki canlı ortam kapıları açıktır.
Bu karar Faz 10'un performans kabulünden bağımsızdır. Son yük ölçümü kullanıcı
isteğiyle durduruldu; bu rapor güvenilir kapasite veya Faz 10 için PASS vermez.
Bu belge hukuki uygunluk sertifikası veya müşteri verisi üzerinde işlem onayı
değildir. Bütün uygulamalı işlemler yeni, owned ve sentetik veritabanlarındadır.

## Ön analiz ve değişiklik gerekçesi

Mevcut sistemde privacy talebi/iki kişi onayı, tenant lifecycle, export, legal hold,
audit hash zinciri ve AES-GCM vardı. Privacy uygulaması scope'u yeterince
ayırmıyor, ortak kullanıcı kimliğini başka tenant'lar varken değiştirebiliyor,
üyeliği kapatırken oturum/API anahtarı erişimini atomik sonlandırmıyordu. Export
tek kullanım hakkını snapshot üretmeden tüketebiliyor ve gereksiz subject/audit
içeriği döndürebiliyordu. Tenant export listesinde gerçek model adı `InvoiceLine`
yerine `InvoiceItem` vardı. AI governance logları diagnostic loglardan ayrı olarak
prompt/sonuç/draft içeriklerini saklayabiliyordu. Tek encryption anahtarıyla
güvenli okuyucu geçişi ve eski backup kurtarma prosedürü eksikti.

## Pilot veri işleme envanteri

Süreler aşağıda uygulama durumu veya **onay bekleyen karar** olarak belirtilir;
kod varsayılanları hukuki süre olarak sunulmaz. Veri sorumlusu, işleme amacı,
hukuki dayanak ve ülke/alt işleyen envanteri pilot sözleşmesine bağlanmalıdır.

| Veri sınıfı / örnek modeller | Amaç / erişim | Saklama ve talep davranışı |
|---|---|---|
| Tenant / User / TenantUser / Role | Şirket, kimlik, üyelik, yetki; tenant RBAC ve ayrı platform admini | Kimlik/üyelik scope'lu export; kapanış onayı ve hold kontrolü; ortak global kimlik ayrıca değerlendirilir |
| Contact | Müşteri/tedarikçi iletişim, vergi ve adres; tenant iş kullanıcıları | Retention preview varsayılanı 1825 gün; fiziksel silme yok, finansal belge ilişkisi ve hukuk kararı gerekir |
| Invoice / Payment / Allocation / Journal / Ledger | Muhasebe, tahsilat, vergi; ilgili tenant finans yetkisi | Preview 3650 gün, legal archive/hold; privacy talebiyle değiştirilmez veya silinmez |
| Product / StockMovement / StockLevel | Stok ve maliyet bütünlüğü; tenant inventory yetkisi | Preview ürün yaşını 1825 gün ile değerlendirir; geçmiş stok/muhasebe zinciri korunur |
| Employee / Payroll | Özlük, iletişim, ücret; sınırlı İK/bordro rolü | Preview 3650 gün; identity talebi bu tabloları otomatik temizlemez; ayrı hukuki inceleme gerekir |
| Attachment / StorageReservation / ChatAttachment | Dosya ve kapasite yönetimi; tenant/entity erişimi, storage provider | Metadata/kota ve bounded orphan cleanup korunur; provider, mesaj, dosya ve yedek için ayrı silme kapsamı gerekir |
| ChatConversation / ChatMessage | İşbirliği; tenant ve katılımcı yetkileri | Mevcut plan/chat retention kuralları sürer; privacy işlemi bütün mesaj gövdelerini silmiş sayılmaz |
| AuditLog / PlatformAdminAuditLog | Hesap verebilirlik ve güvenlik; yetkili admin/denetçi | Preview audit 2555 gün; platform append-only/hash zinciri; AUDIT scope yalnız export'tur, erase ile reddedilir |
| Diagnostic log / trace / metric | Operasyon ve olay teşhisi; ayrı operatör ağı/RBAC | Body/secret/PII varsayılan dışarıda; Loki 7 gün, Tempo 72 saat, Prometheus 7 gün/1 GB, Docker 10 MB × 3; staging silme ve erişim onayı gerekir |
| Analytics / observability snapshots | Kullanım ve kapasite; izinli admin/rapor rolü | Tanımlayıcılar metric label'ı değildir; mevcut DB analytics retention'ı ayrıca onaylanmalı; telemetry TTL DB analytics'i silmez |
| AiRequestLog / AI provider akışı | Politika, token/maliyet/işlem denetimi; tenant AI yönetişimi | Varsayılan metadata; içerik ancak operatör bayrağı **ve** tenant `logPrompts` birlikte açıkken redaction ile; dış AI'ye gönderim ayrı politika/onay konusudur |
| SupportSession / erişim audit'i | Onaylı, süreli destek; ilgili platform destek yetkisi | Consent, expiry, revocation, audit korunur; içerik diagnostic log'a kopyalanmaz; kesin saklama süresi onay bekler |
| pgBackRest backup / WAL / encryption escrow | Kurtarma; ayrı backup/restore operatörü | Yedi full chain + gerekli WAL; off-host kopya ve escrow gerekir. Chain sayısı kesin gün veya hukuki saklama süresi değildir |

İlişkisel DB, Redis cache/session, storage provider, AI/e-posta/marketplace
provider, monitoring volume'ları, yedek/nesne versiyonları ve destek export'ları
ayrı veri kopyalarıdır. DB'deki bir işlemin tamamlanması hepsinden silme anlamına
gelmez. Gerçek provider bölgeleri, alt işleyen sözleşmeleri, dış aktarım koşulları
ve erişim sahipleri pilot öncesi envantere eklenmelidir.

## Uygulanan güvenlik sınırları

- `privacy.service.ts`: scope/type runtime doğrulaması; self-approval reddi
  korunur. Request advisory lock, session registry → tenant → identity kilit
  sırası ve 1 s lock budget'ı kullanılır. Hem tenant hold hem subject/tenant legal
  hold kontrol edilir. Hold oluşturma da aynı tenant satırıyla sıralanır.
- Identity kilidi, başka tenant üyeliğinin count ile global kullanıcı değişimi
  arasına girmesini engeller. Başka üyelik varsa IDENTITY işlemi reddedilir;
  diğer tenant kimliği değiştirilmez. MEMBERSHIP scope yalnız hedef üyeliği
  kapatabilir. İşlem hedef üyeliğin tercihlerini temizler, erişimini kapatır ve
  kullanıcının o tenant'ta ürettiği API anahtarlarını/oturumlarını aynı transaction
  içinde iptal eder. Uygun tek-tenant kimliğinde iletişim/reset alanları maskelenir.
- Bu işlem **sınırlı pseudonymization/deaktivasyondur**. UI/contract'taki ERASURE
  veya ANONYMIZATION adı, bütün ilişkisel kayıtlardan/backup'lardan geri
  döndürülemez anonimleştirme sertifikası değildir. İşlem request'inin ve audit
  kayıtlarının kendisi subject bağlamı içerebilir; bunların tutulma gerekçesi ve
  süresi hukuk tarafından ayrıca değerlendirilmelidir.
- Zorunlu privacy audit'i gerçek `executedById`, approvedById, tenant ve trusted
  request ID ile business transaction'ındadır; diagnostic exporter'a bağımlı
  değildir. Finans/audit kayıtları korunur, erişim talebi legal hold nedeniyle
  otomatik engellenmez. Değiştirici talep hold altında uygulanmaz.
- `privacy-export.service.ts`: token hash ile tutulur, sıkı token biçimi,
  COMPLETED+EXPORT kontrolü; tek kullanım claim'i snapshot ile aynı bounded
  RepeatableRead transaction'ında commit olur. Başarısız/oversize üretim claim'i
  rollback eder. Audit yalnız subject action metadata'sı ve en fazla 1000 satır;
  aşımda sessiz truncation yapılmaz. Body/finans/foreign-tenant audit verilmez.
- Subject export SHA-256, integrity alanı hariç `JSON.stringify` UTF-8 içindir.
  `tenant-lifecycle-export.service.ts` gerçek InvoiceLine, PaymentAllocation ve
  LedgerAccount'u içerir; 1000 satır/model ve 25 MiB sınırını aşan export reddedilir.
  Dosyalar, JSON alanları, credential ve platform ayarları bunun dışında kalır;
  export tam backup değildir.
- `admin-audit.controller.ts`: tam dönen gövde için `x-content-sha256`, `no-store`;
  trusted RID/CID. SHA-256 değişim tespiti sağlar; bağımsız dijital imza değildir.
- `ai-governance.service.ts`: policy okunamaması içerik loglamayı açmaz;
  `AI_GOVERNANCE_CONTENT_LOGGING_ENABLED=true` ve tenant policy birlikte gerekir.
  Varsayılan draft/result/entity/prompt/provider error body saklanmaz; güvenli
  işlem sonucu/kod ve maliyet metadata'sı kalır. Opt-in içerikte redaction,
  bütün kişisel verilerin tespit edileceğinin garantisi değildir.

## Saklama, kapanış ve restore prosedürü

1. Veri sahibinin kimliğini doğrula; tenant, kapsam, gerekçe ve ticket kaydet.
   Yetkili ikinci kişi onayı, legal hold, muhasebe/özlük saklama ve dış provider
   kopyalarını kontrol et. Gerçek müşteri verisi üzerinde ayrıca açık işlem
   yetkisi olmadan bu raporla silme/export başlatma.
2. Retention ekranı preview/dry-run üretir; aday sayısı ve son özet saklanır.
   `review/archive/anonymize/legal_hold` kural adları çalışan bir otomatik purge
   motoru değildir. Süreler ve dayanaklar onaylanmadan otomatik silme eklenmedi.
3. Tenant kapanışı mevcut iki kişi onayı/version guard, güncel export, checklist,
   legal hold, retentionUntil ve en az 30 günlük beklemeyi kullanır. DELETED
   durumuna geçiş erişim/yaşam döngüsü durumudur; bütün tabloları ve dosyaları
   fiziksel silen bir mekanizma olduğu iddia edilmez.
4. Backup'tan tek bir kişinin satırlarını yeniden yazıp recovery chain'i bozma.
   Yedeklerin erişimini sınırlayıp onaylı süre sonunda bütün chain/versiyonları
   expire et. Son silme/hold/revocation kararlarının restore sonrası yeniden
   uygulanması için bağımsız, erişimi kontrollü tombstone/reconciliation kaydı
   gerekir; otomatik ve felaket alanı dışında dayanıklı registry henüz yoktur.
   Restore ortamını müşteri trafiğine açmadan bu adım operasyon kapısıdır.

## Anahtar rotasyonu ve recovery

| Anahtar | Güvenli sıra | Kanıt / sınır |
|---|---|---|
| Tenant API key | Aynı scope/tenant ile rotate; raw yeni anahtarı yalnız bir kez yetkili kullanıcıya teslim et; eskiyi iptal et | Gerçek API create/rotate; eski 401, yeni scope ile çalışır, foreign tenant erişmez; fixture credential'ları yayımlanmaz |
| Tenant JWT secret | Secret manager'da yeni bağımsız değer; bütün API/worker reader'larını planlı yeniden başlat; eski oturumları yeniden girişe yönlendir | Yeni gerçek HTTP process eskiyi reddeder/yeni token'ı kabul eder; escrow rollback ayrı process ile doğrulanır; kesintisiz multi-key JWT protokolü eklenmedi |
| Admin JWT secret | Tenant secret'ından bağımsız değiştir; MFA/session doğrulamalarını koru; ayrı rollout ve yeniden giriş | Tenant anahtarı admin token imzalayamaz; gerçek restart/rollback testleri vardır |
| Provider credential encryption | Önce bütün reader'lara v1+v2 desteğini dağıt; eski v1 için `ENCRYPTION_PREVIOUS_KEYS.legacy`, yeni active key+benzersiz ID; sonra writer bayrağı, bounded onaylı rewrap ve doğrulama | AES-256-GCM, v2 ID AAD ile doğrulanır; en fazla dört geçmiş canlı key. `legacy` active ID olarak reddedilir; key kaybı/yanlış key fail-closed ve escrow recovery test edilir |
| pgBackRest repository cipher | Yeni bağımsız repository/chain; eski chain'ler expire olana kadar eski cipher'ı ayrı escrow'da tut | Application encryption key ring'i repository cipher'ını döndürmez; Faz 9 ayrı-key restore mekanizması korunur |

Secret'lar CLI argümanına, rapora, telemetry'ye veya Git'e yazılmaz. Canlı key
ring sınırı backup eskilerinin tümünü kapsamayabilir; eski recovery noktaları için
offline escrow ve restore tatbikatı zorunludur. v2 yazmaya geçildikten sonra yalnız
v1 bilen sürüme rollback güvenli değildir; writer bayrağını kapatmak mevcut v2
ciphertext'i kendiliğinden v1'e dönüştürmez. Rewrap gerçek müşteri DB'sinde otomatik
başlatılmadı.

## Testler ve kalan kapılar

İlk owned PostgreSQL koşusu `axon-dr-5021c933d74f` 139/139 PASS: ortak kimlik
yarışı, scope, iki kişi onayı, hold, session/API key revocation, one-use export ve
oversize rollback, gerçek invoice-line export, key rewrap/escrow ve yeni HTTP
process ile tenant/admin JWT rotasyonu dahildir. `axon-dr-b76e4f48ca45` tam DR
regresyonunda **18/18 recovery + 141/141 cross-module PASS**; ek audit HTTP
digest/context ve retention dry-run kontrolleri dahildir. `axon-dr-97218b6714d6`
hedefli governance koşusunda **15/15 PASS**, skip yoktur; gerçek mail HTTP enqueue
→ DB/outbox → worker → provider HTTP için tek ve eksiksiz parent graph da
`cross-module/phase10-mail-trace.json` ile doğrulanır. Bütün owned kaynaklar temizlendi.
Son kaynak sürümünde `axon-dr-32589eb3b6fc`: **144/144 cross-module PASS**, skip=0;
bu dosyadaki observability/governance senaryoları **17/17 PASS**.
`cross-module/phase10-mail-trace.json` ayrı producer/worker process ID'leriyle
gerçek HTTP → DB/outbox → worker → provider HTTP için 23 span, tek trace/root,
eksiksiz parent graph ve bir provider teslimini doğrular. Unit toplamı **439 PASS**;
guards redaction, malformed trace/ciphertext, SQL guard ve access policy'yi doğrular.
`axon-dr-a38bc5eb8fb6/phase10-pitr-integrity.json` gerçek audit corruption'ın
alarm/log/trace ile bulunmasını ve ayrı hedef PITR sonrası 12 business/audit
tablosunun eşleşen SHA-256'ını kanıtlar. Append-only trigger'lar korunur. DB/host
saat farkı ölçülür; bu yerel sinyal bağımsız NTP doğrulaması değildir.

Bu alt fazın **CONDITIONAL PASS** kararı diğer fazların sonucundan bağımsızdır.
Uygulanan kapsamlı access/export/rotation kontrolleri yerel olarak doğrulanmıştır;
scoped deactivation/pseudonymization tam erasure olarak sunulmaz. Ortak telemetry
CPU/RAM/latency/disk maliyeti `phase-10-observability.md`, istemci maliyeti
`phase-10.1-web-quality.md` içindedir; bu alt faza özel maliyet ayrıştırılmadı.
Hukuk/uyum onayı, dış provider silme teyidi, bütün model
ve backup kopyalarında tam erasure, restore sonrası bağımsız tombstone uygulaması,
off-host escrow, gerçek NTP kaynağı ve üretim key rollout tatbikatı açık kapılardır.
Bu sınırlar kapatılmadan tam KVKK/GDPR uyumluluğu veya otomatik tam silme iddiası
kurulmaz. KVKK silme/anonimleştirme çerçevesi [ilgili yönetmelik](https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK)
ve GDPR hak/istisnaları [resmî düzenleme](https://eur-lex.europa.eu/eli/reg/2016/679/)
üzerinden hukuk tarafından somut veri kategorisine uygulanmalıdır.
