# Faz 7 — Deployment ve sürümleme

Bu fazın repository uygulaması Linux Docker Compose üzerinde ayrı API, worker,
web ve HTTPS proxy süreçleri kullanır. Mevcut `CI Assurance` workflow'u korunur.
Gerçek staging sunucusu, alan adı ve runner erişimi henüz sağlanmadığından canlı
deployment yapılmış kabul edilmez.

## Kodun yerleşimi

| Konum | Sorumluluk |
|---|---|
| `packages/types/src/release.ts` | API, event ve feature protokolleri; güvenli sürüm kimliği |
| `apps/backend/src/bootstrap/operations` | Readiness, bağlantıların ve işlerin kontrollü kapanması |
| `apps/backend/src/config/deployment-env.ts` | Staging/production başlangıç doğrulaması |
| `apps/backend/scripts/deploy` | Kilitli migration; boş kurulum, upgrade ve drift doğrulaması |
| `apps/web/src/app/{ready,release-info}` | Cache edilmeyen web readiness ve sürüm bilgisi |
| `scripts/release` | Tipli manifest, deployment durumu, rollback, scaling ve container doğrulaması |
| `deploy` | Bağımsız deployment tanımları, private env ve autoscaling örnekleri |

Local geliştirme mevcut compose dosyalarını kullanır. Yönetilen staging ve
production için canonical tanım `deploy/compose.yml` dosyasıdır;
`docker-compose.prod.example.yml` eski geliştirme compose override örneğidir ve
bu release akışında kullanılmaz. CI kendi PostgreSQL ve geçici container'larını
oluşturur. Staging yalnız sentetik veya güvenle anonimleştirilmiş veri kullanır.

## Sunucuda ilk kurulum

1. Ayrı staging/production Linux host, Docker Engine + Compose v2 ve Node 22
   hazırla. DNS'i hosta yönlendir; dışarıya yalnız 80/443 aç. API, worker, DB ve
   Redis portlarını public açma. Runner etiketleri `self-hosted, linux, x64,
   axon-staging` veya `axon-production` olmalı.
2. `deploy/runtime.env.example` değerlerini repository dışında ayrı bir private
   dosyaya aktar; izin `0600`, dizin `0700` olsun. Secret'ları workflow loglarına,
   build argümanlarına veya frontend değişkenlerine koyma. Örnek placeholder'lar
   deploy edilebilir secret değildir. Ortam başına farklı credential kullan.
3. Uygulama için PostgreSQL pool bağlantısını `connection_limit=1..20` ve
   `pool_timeout=1..30` ile sınırla. Toplam bütçe replica sayısı × süreç pool
   limitidir; migration, yönetim ve bakım bağlantıları için pay bırak.
   `MIGRATION_DATABASE_URL` doğrudan PostgreSQL'e bağlanmalı; transaction pooler
   bağlantısını migration için kullanma.
4. Redis'i ayrı credential ve private ağ/TLS ile sağla. `APP_URL` ve
   `ALLOWED_ORIGINS` tam HTTPS origin olmalı. JWT/admin anahtarları farklı ve
   gerekli secret'lar en az 32 karakter olmalı.
5. Private S3/R2 bucket, HTTPS endpoint, gerçek mail sağlayıcısı ve enforcing
   malware scanner yapılandır. Runtime local upload/fallback kabul etmez.
   Uygulama credential'ına yalnız gereken bucket/prefix read/write/delete
   yetkilerini ver; public ACL, bucket yönetimi ve başka ortam erişimi verme.
   Readiness imzalı bucket HEAD isteğiyle erişimi kontrol eder; bu kontrol tüm
   write/delete izinlerinin kanıtı değildir. Hedef bucket'ta sentetik upload,
   download, scan ve delete smoke ayrıca yapılmalı.
6. Lifecycle politikasını sağlayıcıda sürümle ve uygula: yarım multipart
   upload'ları temizle; aktif ERP dosyalarını genel bir süre sonunda silme.
   Retention/legal hold ve DB referanslarıyla uyumlu uygulama silmesini koru.
   Noncurrent object version/backup saklama süresini kurumun politikasına göre
   belirle. Aynı credential staging ve production bucket'larına erişmemeli.
7. `PROXY_IMAGE` değerini doğrulanmış Caddy 2 `@sha256:...` digest'i yap.
   Caddy sertifikaları kalıcı volume'da saklar; hostun DNS ve ACME erişimi gerekir.
   HSTS ve HTTPS forwarding etkin, uygulama session cookie'si Secure/HttpOnly/
   SameSite=Lax'tır. `METRICS_ENABLED=false` varsayılandır.

İlk yönetilen kurulum boş DB ister. Mevcut bir müşteri DB'sini bu akışa almak
için önce o sürümün doğrulanmış manifest/schema baseline'ını ve backup/restore
kanıtını hazırlayan ayrı bir adoption çalışması gerekir. Boş DB kontrolünü
atlamak veya production seed/reset çalıştırmak bu akışın parçası değildir.

## GitHub release akışı

GitHub `staging` ve `production` environment'larını ve ilgili runner'ları
tanımla. Her environment için repository dışında kalıcı, birbirinden farklı
`DEPLOYMENT_ROOT`, `DEPLOYMENT_ENV_FILE`, `DEPLOYMENT_HOST` değişkenleri gerekir.
`API_REPLICAS` ve `WORKER_REPLICAS` ayrı ayrı 1..20 aralığındadır.
Production environment'a required reviewer kuralı eklenmeden promotion çalışmaz.
Deployment kullanıcısı Docker erişimine sahip, yalnız güvenilir release işleri
için ayrılmış olmalı; PR kodunu bu runner'da çalıştırma.

`PREVIOUS_RELEASE_SHA` repository değişkenini gerçekten çalışan production
sürümüne ayarla. Tanımlı değilse migration assurance `HEAD^` kullanır; bu yalnız
bir geliştirme baseline'ıdır ve production upgrade kanıtının yerini tutmaz.

- `Release Assurance`: boş PostgreSQL kurulumu, önceki commit şemasından upgrade,
  sentetik kaydın korunması, iki DB'de drift kontrolü ve release testleri.
  İzole upgrade DB'sinde kasıtlı migration hatası, doğrulanmış additive DDL onarımı,
  `migrate resolve --applied`, yeni backfill migration ve tekrar sıfır drift de
  doğrulanır; eski migration SQL'i değiştirilmez. Baseline komutları repository'nin
  sabit `migrations.path` ayarından ayrılır; uygulanan migration listesi seçilen
  commit'in gerçek listesiyle karşılaştırılır.
- `Release Delivery`: yalnız kendi repository'sindeki başarılı main push CI
  sonucunu kabul eder; aynı SHA için assurance sonucunu bekler. Backend, worker
  ile ortak runtime image, migrator ve web image'larını üretir. Manifest tüm
  image'ları digest ile sabitler. Yayınlanan uygulama digest'leri taranır ve
  izole container testinden geçer; ardından otomatik staging deployment başlar.
  Uygulama runtime image'ına migration/assurance script'leri taşınmaz; DB job'ı
  ayrı migrator image'ını kullanır.
- `Operate Release`: başarılı staging run'ının aynı bundle'ını production'a
  promote eder; aynı araçla uygulama rollback'i ve bağımsız replica ayarı yapılır.
  Production işlemi environment onayına tabidir.

Manifest SemVer, Git SHA, image digest'leri, migration listesi/checksum/tip,
API/event/feature protokolleri, tarih ve rollback stratejisini taşır. API
`/release`, web `/release-info` kimliği döndürür. Web build deployment ID Git
SHA'dır. Production varsayılan API/WS bağlantısı tarayıcıyla aynı origin'i kullanır;
aynı image farklı staging/production origin'lerine taşınabilir. Release endpoint'leri
cache edilmez; web runtime cache'i kalıcı müşteri dosyalarından ayrıdır.

## Deployment, rollback ve forward-fix

Environment başına filesystem kilidi eşzamanlı deployment/scale/rollback'i
engeller. PostgreSQL advisory transaction kilidi migration job'ını tekilleştirir.
Deployment dizini environment ve origin'e bağlanır. Compose tanımları her SHA
için kalıcı, değiştirilemez kopyada saklanır; eski sürüm rollback'i veya autoscale
değişen runner checkout'una bağlı değildir.

Yeni release önce eski worker'ları durdurur. Worker mevcut işi tamamlar, sonraki
işi claim etmez; API/worker grace süresi 390 saniye, uygulama kapanma üst sınırı
360 saniyedir. Yeni API/worker/web hazır olunca proxy slotu değiştirilir ve HTTPS
üzerinden API/web SHA ile readiness kontrol edilir. Ardından eski HTTP süreçleri
kapanır. WebSocket bağlantıları reconnect için 1012 koduyla kapatılır.

`active.json`, `previous.json` ve `database.json` deployment root altında tutulur.
Migration sonrası candidate başarısız olsa da DB yüksek su işareti korunur;
ilk deployment başarısızlığı yeniden denendiğinde bilinen şema boş sanılmaz.
Readiness/doğrulama başarısızlığında önceki uygulama geri başlatılır, proxy geri
alınır ve candidate durdurulur. DB otomatik downgrade veya reset edilmez.

Normal migration kuralı **expand → migrate → contract**. Önceki migration'ların
checksum'ları değiştirilemez; destructive yeni SQL otomatik deploy'da reddedilir.
SQL taraması konservatif bir korumadır, DB incelemesinin yerini tutmaz; trigger,
stored procedure ve veri dönüşümlerinin anlamı ayrıca incelenmeli. Otomatik
rollback için API/event/feature protokollerinin aynı kalması zorunludur. Protocol
değişimi veya contract migration ayrı rollout, doğrulanmış backup ve açık inceleme
gerektirir; bu iş akışında gizli bir bypass bulunmaz.

Migration hata verirse `_prisma_migrations` ve ilgili DB değişikliğini incele,
başarılı migration dosyasını değiştirme. Partial migration için doğrulanmış
forward-fix SQL/migration hazırla ve staging'de tekrar upgrade + drift kontrolü
yap. `migrate resolve` yalnız gerçek DB durumu doğrulandıktan sonra operatörce
uygulanmalı. Kilit sahibi process öldüyse deployment lock dizinini silmeden önce
çalışan deployment/migrator olmadığını doğrula. Container durdurma veri volume'larını
silmez; release aracı `down -v`, seed veya reset çağırmaz.

## Sağlık ve ölçekleme

`/health` süreç canlılığıdır. API `/ready`: DB ve beklenen migration, Redis,
object storage ve sağlıklı worker heartbeat'i. Worker'ın private `3102/ready`
endpoint'i kendi dependency/loop durumunu gösterir. Dependency hatası `503`
döner; connection string ve provider hata içeriği dışarı verilmez. Probe'lar
paylaşılan, kısa süre cache edilen ve süre sınırı olan kontrollerdir. Redis
arızasında readiness erişimi rate limit katmanına takılmaz.

`deploy/axon-autoscale.*.example` isteğe bağlı systemd timer/service örnekleridir.
Doğrulanmış release-tools bundle'ını `/opt/axon/release-tools` konumuna kur;
private `/etc/axon/autoscale.conf` ile `AUTOSCALE_ENABLED=true`, `DEPLOYMENT_*`,
`AUTOSCALE_API_MIN/MAX/TARGET_CPU` ve `AUTOSCALE_WORKER_MIN/MAX/TARGET_CPU` belirle.
Varsayılan aralık 1..5, CPU hedefi %70, cooldown 5 dakikadır. Her rol ayrı ölçülür;
normal azaltma bir replica ile sınırlıdır; yeni maksimum mevcut sayının altına
indirilmişse bu üst sınır önceliklidir. Okunan release değişmişse otomatik veya
manuel scale/rollback işlemi reddedilir.
Bu başlangıç politikası Faz 8 yük/queue/backlog kapasite ölçümünün yerini tutmaz.

## Doğrulama ve kalan altyapı işi

Yerel kanıtlar `artifacts/phase7-*.log` altında tutulur; artifact ve private plan
Git'e eklenmez. Migration assurance gerçek izole PostgreSQL 17 kullanır.
Yerel image'lar mevcut çalışma ağacından geçici `0.0.0-phase7-local` sürümü ve
sıfır SHA etiketiyle oluşturulur; yayınlanmış release değildir. Gerçek release
workflow'u doğrulanmış commit SHA'sını ve registry digest'lerini kullanır.
2026-11-17 tekrar doğrulaması: tüm workspace typecheck'leri, 385 unit test, 88 çapraz
modül testi, 18 release testi, mimari/tenant/güvenlik guard'ları ve deployment
Compose/Actions tanımları başarılı. Web lint'te hata yok; bu fazın dışındaki
dosyalarda mevcut 5 uyarı var. Değişen TypeScript dosyalarında explicit `any`
ve kullanılmayan import bulunmadı.
Container assurance manifest'teki digest'lerle iki eşzamanlı migrator, readonly
API/worker/web, imzalı TLS object-storage HEAD, dependency kesintisi/recovery,
worker drain/crash restart, HTTP drain ve gerçek HTTPS reverse proxy üzerinden
login cookie ve authenticated WSS bağlantısının 1012 ile kapanma kontrolünü yapar.
Object storage fixture'ı gerçek cloud sağlayıcısı
değildir; production mail/e-belge sağlayıcılarına test isteği göndermez.

Gerçek staging hedefi sağlandığında runner/environment kurulumu, DNS/ACME,
sağlayıcı izinleri/lifecycle, sentetik dosya smoke'u, canlı staging deployment ve
aynı hedefte stop/rollback tatbikatı yapılmalıdır. Bu dış ortam kanıtları gelmeden
Faz 7'nin canlı staging çıkış kriteri sağlanmış sayılmaz.

## Tekrar incelemede kapatılan açıklar

- Deploy öncesi kaynak kontrolü `HEAD` ile hem index hem çalışma ağacını
  karşılaştırır; stage edilmiş veya commit edilmemiş deployment tanımı reddedilir.
- Manuel scale/rollback, kilit alındığında hâlâ okuduğu release'in aktif olduğunu
  doğrular. Eşzamanlı deployment eski bir scale talebiyle geri alınamaz.
- Autoscaling yeni maksimumu her dalda uygular; geçersiz veya kesirli PostgreSQL
  pool timeout değeri başlangıçta reddedilir.
- SQL taraması rename ve constraint/index kaldırmalarını da ayrı incelemeye
  yönlendirir. Yorum ve literal içeriği konservatif olarak taranır; yorum işareti
  içeren bir literal sonraki destructive SQL'i gizleyemez.
- Komut aracı stdout kapanana kadar bekler; subprocess exit olayı geldiğinde
  henüz okunmamış digest/JSON çıktısını kaybetmez.
- API, WebSocket bağlantılarının kapanmasını HTTP/worker işleriyle birlikte
  bekler. Drain sırasında yeni upgrade reddedilir; DB bağlantısı erken kapanmaz.
