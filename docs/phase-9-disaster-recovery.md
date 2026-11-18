# Faz 9 — Backup, restore ve disaster recovery

## Karar ve kapsam

**Karar: CONDITIONAL PASS — izole yerel kurtarma doğrulaması. Pilot/production
DR onayı verilmez. Gerçek staging restore tatbikatı pilot öncesi zorunludur.**

**Tekrar inceleme (2026-11-18):** Aşağıdaki ilk uygulama kanıtlarına ek olarak,
son incelemede 18/18 gerçek DR ve 126/126 cross-module testi tekrar geçti.
Yeni güvenlik/finalization kontrolleri ve güncel kanıtlar belgenin sonundadır.

Bu çalışma sentetik ERP verisiyle, sahipliği etiketlenmiş yeni Docker kaynakları
üzerinde yürütüldü. Mevcut development/production veritabanına bağlanılmadı;
deployment, gerçek backup hedefi değişikliği, migration, commit veya push yapılmadı.
Yerel ölçüm, gerçek ortamın RPO/RTO garantisi değildir.

## Mevcut mimari analizi

- Backend Hono/Prisma kullanıyor; modüler Prisma şemasının migration geçmişi
  test veritabanına mevcut kilitli release migrator ile uygulanıyor. Tenant
  middleware ve Prisma runtime tenant korumaları mevcut. Bunlar değiştirilmedi.
- `platform/disaster-recovery` servisi ve Admin DR web ekranı **kanıt ve tatbikat
  kaydı** tutuyor. Mevcut simulation akışları PostgreSQL backup/restore çalıştırmıyor.
  Bu işlevler yeniden yazılmadı; web/API üzerinden yıkıcı restore açılmadı.
- Admin okumaları `operations.read`, kayıt işlemleri `operations.manage` iznine
  bağlı. Tatbikat `approvalId` alanı bir kayıt referansıdır; tek başına güçlü
  operatör doğrulaması veya gerçek restore icra yetkisi değildir.
- Mevcut Admin DR policy schema varsayılanı 60 dakika RPO'dur ve mevcut overview
  backup tamamlanma yaşını değerlendirir. Yeni WAL health kontrolü 900 saniye
  hedefini uygular. Staging adoption sırasında mevcut policy API'siyle hedef
  15/240 dakika olarak ayarlanmalı; manuel evidence/overview sağlığı sürekli WAL
  aktarımının bağımsız monitörü yerine kullanılmamalı. Canlı policy kaydı bu
  çalışmada değiştirilmedi.
- API ve worker ayrı süreçler. Domain event outbox, lease ve tüketici receipt
  kayıtları PostgreSQL'de kalıcı. Yeniden başlatma sırasında worker'ın uyguladığı
  mali/stok işlemlerini tekrarlamak yerine mevcut lease/receipt akışı kullanılmalı.
- Dosya provider'ı PostgreSQL transaction'ına katılamaz. Faz 8.2'nin kota,
  reservation ve sınırlı cleanup/recovery mekanizması korundu. PostgreSQL PITR,
  provider'dan daha sonra silinmiş nesneleri kendiliğinden geri getirmez.
- Canonical uygulama deployment'ı `deploy/compose.yml`; bu çalışma onun çalışan
  DB veya storage ayarlarını değiştirmiyor. DR image ve araçları ayrı, opt-in
  bileşenlerdir.

## Uygulanan backup/restore mimarisi

`deploy/dr/Dockerfile`, PostgreSQL 17 ve sürümü sabitlenmiş pgBackRest 2.60.1
paketini içerir. Test edilen image kimliği her koşunun `runtime.json` dosyasında
saklanır. Yeni staging/production image ayrıca digest ile sabitlenip taranmalıdır.

| Bileşen | Sorumluluk |
|---|---|
| `deploy/dr/configure.sh` | Private dosyadan cipher okuma; 0600 geçici konfigürasyon; erişilemeyen anahtarda fail closed |
| `deploy/dr/backup-loop.sh` | Otomatik günlük full backup, WAL check, retention; 1800 sn komut sınırı; hata durumunda nonzero çıkış |
| `deploy/dr/repository-s3.conf.example` | Ayrı hesap/bucket ve workload identity ile off-host repository yapılandırma örneği |
| `scripts/disaster-recovery/cluster.ts` | Yeni test kaynakları, loopback portları, ownership/role kontrolü, yalnız kendi kaynaklarını temizleme |
| `scripts/disaster-recovery/operations.ts` | Backup metadata, integrity, belirli backup setinden boş hedefe fiziksel/PITR restore |
| `scripts/disaster-recovery/health.ts` | Backup yaşı ve archiver freshness/failure değerlendirmesi |
| `scripts/disaster-recovery/audit.ts` | Operasyon başlangıcı/başarı/hata için sıralı hash-chain kayıtları |
| `apps/backend/scripts/disaster-recovery` | Schema/migration/veri fingerprint, object reference kontrolü, restore sonrası gerçek HTTP/ERP doğrulaması |

Eklenen/değişen dosyalar: kök `package.json` (dört komut);
`scripts/disaster-recovery/{cli,cluster,operations,process,validation,health,audit,automatic-wal}.ts`
ve paket tipi; `tests/{drill,safety}.test.ts`, `tests/faults.ts`;
`apps/backend/vitest.disaster-recovery.config.mts`;
`apps/backend/scripts/disaster-recovery/{database-inspection,storage-inspection,verify-restored}.ts`;
`deploy/dr/{Dockerfile,configure.sh,backup-loop.sh,repository-s3.conf.example,README.md}`
ve opt-in Linux service/timer örnekleri; bu rapor ve ignore kapsamındaki `a.md`.
Backend/web runtime domain veya API contract'ında değişiklik yoktur.

PostgreSQL data checksums ile başlatılır; WAL arşivleme açıktır. `archive_timeout`
60 saniyedir. **Günlük full backup tek başına 15 dakika RPO sağlamaz.** RPO için
başarılı ve kesintisiz WAL aktarımı, sağlıklı arşiv ve erişilebilir anahtar gerekir.
Health kontrolü 900 saniyeyi aşan arşiv yaşında, düzelmemiş archive hatasında veya
26 saati aşmış full backup'ta başarısız olur. Tamamen boş/idle veritabanında eski
archive zamanı konservatif alarm üretebilir; bu sayaç kayıp veri ölçümü değildir.

Repository AES-256-CBC ile şifrelenir. Backup metadata ve gereken WAL zincirleri
repository'de kalıcıdır; yedi full zinciri saklanır. Manuel ek full backup'lar
olursa yedi zincir, yedi takvim günü anlamına gelmez. Retention ihtiyacı staging
veri değişim hızı ve maliyetle kesinleştirilmeli. pgBackRest backup/restore,
verification ve retention davranışları [resmî kullanıcı kılavuzu](https://pgbackrest.org/user-guide.html)
ve [komut referansı](https://pgbackrest.org/command.html) esas alınarak kullanıldı.

Yerel testte PGDATA ile repository ayrı volume'lardır. Restore container'ında
repository gerçekten read-only mount edilir. Bu, **ayrı fiziksel host/bölge veya
cloud IAM izolasyonu kanıtı değildir**. Off-host repository için verilen S3
örneği canlı hedefe uygulanmadı. Application identity'sine repository veya cipher
erişimi verilmemeli; backup yazıcısı ve restore okuyucusu farklı kimlikler olmalı.

### Restore güvenliği ve tekrar deneme

- CLI yalnız sentetik `drill`/`wal` kabul eder; dışarıdan veritabanı URL'si veya production restore
  komutu kabul etmez. Test kaynakları rastgele `axon-dr-*` sahibine bağlanır.
- Hedef adı, Docker ownership etiketi ve `restore` rolü doğrulanır. Onay metni
  kaynak ve tam hedef adına bağlıdır. Source veya başka sahibin kaynağı reddedilir.
- Hedef PGDATA boş olmalıdır. `--delta`, mevcut DB üzerine yazma veya otomatik
  veri dizini silme yoktur. Kesilmiş restore yeni ve boş bir hedefte tekrar edilir.
- Integrity yalnız exit code ile değerlendirilmez: pgBackRest'in backup/WAL
  doğrulama sonucu da valid/ok olmalı; missing/checksum/size/other sayaçları sıfır
  olmalıdır. Belirsiz/eksik çıktı başarı sayılmaz. Restore öncesi tekrar doğrulanır.
- Kurtarılan PostgreSQL archive write kapalı açılır; repository'ye yeni timeline
  yazamaz. Hedef zaman yakalanıp recovery tamamlanmadan başarılı sayılmaz.
- Concurrency pgBackRest repository/restore kilitleriyle sınırlıdır. Scheduler ek
  olarak nonblocking `flock` kullanır. Otomatik sınırsız retry yoktur.
- Anahtar/credential içeren konfigürasyon loglanmaz. Operasyon durumları audit'e,
  sınırlı sentetik diagnostic çıktıları owned artifact dizinine yazılır. Yerel
  audit hash-chain'i kendi yöneticisine karşı değiştirilemez bir audit servisi
  değildir; gerçek ortamda bağımsız append-only sink gerekir.

## Gerçek kurtarma testleri ve kanıtlar

Tekrarlanabilir komutlar, repository kökünden:

```powershell
npm run dr:build
npm run test:dr-safety
npm run dr:drill
npm run dr:wal
```

`dr:drill`, yeni DB'ye migration uygular, gerçek ERP fixture oluşturur, fiziksel
backup/PITR testlerini çalıştırır ve ardından disposable source üzerinde mevcut
tam cross-module regresyonunu çalıştırır. Her koşu ayrı artifact dizini kullanır.
Koşu bittiğinde yalnız o sahibin container/network/volume'ları kaldırılır; test
anahtarları ve token içeren private fixture silinir. Başarısız test sonuçları
silinmez. Secret'lar veya backup dosyaları Git'e eklenmez.

Nihai DR koşusu: `artifacts/disaster-recovery/axon-dr-c37b522b649f`.
`vitest.json`: **16/16 PASS, 0 failed**. PostgreSQL **17.12**, pgBackRest
**2.60.1**; image `sha256:4e2b7f565de65f43cc8e584f5de074161651f984ce5f75a7411771dda08bbdf1`.
Kanıtlar: `measurements.json`, `runtime.json`, `restored-erp.json`, `audit.jsonl`,
`tests.log`, `source-postgres.log` ve `source-state.json`.

| Ölçüm | Yerel sonuç |
|---|---:|
| Full backup set | `20261118-192317F` |
| Backup dosyalarının sıkıştırılmamış toplamı | 43.517.477 byte |
| Backup + integrity süresi | 12,103 sn |
| Ayrı DB base restore + invariant doğrulaması | 9,456 sn |
| Kurtarma hedefi UTC | `2026-11-18T19:23:37.653Z` |
| Kurtarılan marker commit zamanı UTC | `2026-11-18T19:23:37.457Z` |
| Sentetik incident zamanı UTC | `2026-11-18T19:23:38.889Z` |
| **Ölçülen RPO** | **1,432 sn** |
| PITR hedef oluşturma + fiziksel restore/doğrulama | 10,491 sn |
| **HTTP/ERP doğrulaması dahil yerel uygulama RTO** | **14,984 sn** |
| Source kapalıyken bağımsız fiziksel restore | 12,401 sn |
| Migration geçmişi | 103 tamamlanmış migration; checksum/history fingerprint aynı |
| Veri fingerprint grupları | 17 grup; base restore ile aynı |
| Kritik SQL invariant | 10/10 PASS; ihlal sayaçlarının tamamı 0 |
| İlk kurtarılan outbox grubu | 9 receipt, 1 notification; duplicate delivery ek etki üretmedi |
| Storage | 1024 byte used / 0 reserved; terminal orphan temizlendi, committed nesne korundu |
| Scheduler sonrası archive yaşı | 1,034 sn; 24 başarılı archive |

Archiver'ın tarihsel `failedCount=4` değeri gizlenmedi. İlk stanza hazırlanırken
olan archive hataları sonradan giderildi; scheduler sonrasında
`unrecoveredArchiveFailure=false`. Health, tarihsel sayacı sıfırlayarak geçmedi.
Outbox boşluk assertion'ı restore edilmiş ilk iş grubunun recovery/replay
aşamasındadır; sonraki yeni ERP akışı normal, kalıcı yeni intent'ler üretir.
Bu worker'ları kapalı disposable DB'de sonradan oluşan pending kayıtlar,
production queue drain kanıtı olarak sunulmaz.

### Manuel flush olmadan otomatik WAL ve gerçek source kaybı

Ek koşu: `artifacts/disaster-recovery/axon-dr-328cde5a0fb6/automatic-wal.json`.
`npm run dr:wal`, ilk fiziksel backup sonrasında iki marker commit eder;
marker'lardan sonra `pg_switch_wal` veya pgBackRest `check` çağırmaz. PostgreSQL'in
60 saniyelik `archive_timeout` aktarımını bekler, source container'ını SIGKILL ile
kapatır ve yalnız repository'den hedef zamana restore eder. KEEP=1, EXCLUDE=0
assertion'ları geçti.

| Otomatik WAL ölçümü | Sonuç |
|---|---:|
| Commit UTC | `2026-11-18T19:31:11.666Z` |
| Source kaybı öncesi incident zamanı UTC | `2026-11-18T19:32:12.464Z` |
| Archive gözlem bekleme süresi | 58,697 sn |
| **Otomatik WAL/source-crash RPO** | **60,798 sn** |
| Source kapalıyken fiziksel PITR RTO | 7,363 sn |
| Sonuç | **PASS**; marker sonrası zorlanmış flush yok |

Ana ERP tatbikatındaki 1,432 sn RPO kontrollü, flush edilen PITR noktasıdır.
Otomatik archive davranışı için ayrı ölçülen 60,798 sn esas alınır; 14,984 sn
uygulama RTO ise ana ERP fixture'ının HTTP doğrulamasına aittir. Farklı veri
büyüklüğündeki bu iki koşu tek bir production kapasite sonucu olarak birleştirilmez.

| Senaryo | Kanıtlanan davranış |
|---|---|
| Temiz backup ve integrity | Gerçek full fiziksel backup; backup/WAL kontrolü; migration geçmişi ve schema fingerprint |
| Ayrı PostgreSQL restore | Tamamen yeni PGDATA; schema, migration checksum ve iş verisi fingerprint eşitliği |
| Zaman bazlı PITR | Full backup sonrası commit geri gelir; hedef zaman sonrası commit gelmez |
| Bozuk/eksik backup | Ayrı repository klonunda `pg_control` payload hasarı/eksikliği restore'u başarısız yapar; asıl repository korunur |
| Backup process crash | Gerçek pgBackRest lock checkpoint'i sonrası SIGKILL/137; partial işlem başarılı backup listesine girmez; yeniden backup/integrity geçer |
| Restore process crash | Gerçek restore manifest checkpoint'i sonrası SIGKILL/137; yarım hedef üzerine yazılmaz; yeni hedefte restore geçer |
| Source container crash | Source SIGKILL ile kapalıyken yeni PostgreSQL yalnız read-only repository'den restore edilir; invariant ve object referansları geçer |
| Yanlış hedef/onay | Source, başka owner, path traversal, eksik veya başka hedefe ait onay ve dolu PGDATA reddedilir |
| Encryption/key | Cipher erişilemezken güvenli hata; yanlış anahtarla metadata valid sayılamaz; ayrı escrow dosyasından kurtarma |
| Retention | Test politikasında iki full zincir bire indirilir; en yeni zincir gerçekten restore edilir |
| Concurrency | İki backup'tan bir writer; aynı hedefte iki restore'dan bir writer; kaybeden işlem nonzero/failure olarak kalır |
| Otomatik scheduler | Gerçek backup completion kaydı; backup sayısı artar; archive freshness sınırı geçer |
| Online object backup | Backup kilidi aktifken gerçek accounted upload ve HTTP delete; geri gelen DB referansları saklanan versiyonlardan kurtarılır |
| Eksik/erişilemeyen nesne | Read-only kontrol FAIL döndürür; retention'da saklı byte'lar hash kontrolüyle geri konur |
| Orphan cleanup | Restore edilmiş CANCELLED reservation'ın nesnesi silinir; COMMITTED nesne korunur; tekrar çalışmada ek etki yok |
| Worker/outbox | Backup'ta gerçek claimed lease bulunur; expiry/recovery, iki worker ve tekrar delivery receipt'leri yan etkiyi tekrarlamaz |
| Restore sonrası ERP | Gerçek loopback HTTP; tenant dışı kayıt 404; çift eski posting/payment; yeni sipariş→teslim→fatura→tahsilat |

Backup yalnız PostgreSQL'in kendisinde boş bir test tabloyla sınanmadı. Mevcut ERP
endpoint'leriyle iki tenant, müşteri/tedarikçi, ürün, depo, stok hareketi, sipariş,
teslimat, onaylı fatura, tahsilat/allocation, journal, outbox ve accounted attachment
oluşturuldu. Base restore'da bu veri gruplarının sıralı SHA-256 fingerprint'leri
karşılaştırılır. Karşılaştırma plaintext iş verisini rapora yazmaz.

On kritik SQL invariant'ın hepsi geçmelidir: negatif stok; fazla/negatif tahsilat;
tenant dışı fatura satırı/allocation; duplicate payment, stock veya journal etkisi;
dengesiz journal; storage accounting ihlali. Source'ta gerçek pozitif tutarlı
journal ve stok bulunması, boş veri üzerinde vacuous PASS verilmesini engeller.
Restore sonrası eski tahsilat/posting tekrarları sayıları değiştirmez. Yeni ERP
akışı stok 8→7 değişimini ve yeni tahsilatı ayrıca doğrular.

### Dosya tutarlılığının sınırı

DB backup ile provider arasında ortak atomik snapshot yoktur. Testte gerçek
dosyalar ayrı private dizinlerde tutuldu; bir eski object versiyonu bağımsız
SHA-256 escrow kopyasından geri yüklendi. Online backup sırasında oluşturulan ve
silinen dosyaların versiyonları ayrı kurtarma dizinine konup, **restore edilen DB'nin**
referansları ve quota byte toplamlarıyla karşılaştırıldı. Provider erişimsizliği
ve eksik nesne başarı sayılmadı.

Bu yerel object versiyon tatbikatı, gerçek S3/R2 provider'ında versioning,
cross-account replication, Object Lock, lifecycle veya büyük inventory'nin test
edildiği anlamına gelmez. Production PITR için DB kurtarma penceresinin tamamını
kapsayan nesne versiyonları ve key/version/checksum manifest'i gerekir. Restore
edilmiş metadata doğrulanmadan worker cleanup veya bucket-wide orphan silme
başlatılmamalı. DB'de görünmeyen her nesne silinebilir kabul edilmez. Mevcut
cleanup yalnız kendi terminal reservation'ını ve bounded lease/attempt kuralını
kullanır; provider genelinde otomatik purge eklenmedi.

## RPO/RTO yorumlama ve altyapı bütçesi

RPO, sentetik olay zamanı ile kurtarılan `PITR_KEEP` kaydının PostgreSQL commit
zamanı arasından ölçülür. Yalnız istenen recovery timestamp'ini veri kaybı ölçümü
olarak kullanmaz. RTO için yeni hedef container oluşturma, fiziksel restore,
PostgreSQL açılışı ve uygulama doğrulama süreleri ayrı kaydedilir.

Yerel image, Docker host ve repository önceden hazırdır. İnsan onay/tespit süresi,
yeni host satın alma, bölgesel ağ/egress, provider inventory ve büyük gerçek ERP
verisi bu sürelerde yoktur. RPO ≤15 dk / RTO ≤4 saat pilot hedefi olarak korunur;
production garantisi ilan edilmez. Her DB container'ında 2 CPU/1 GiB sınırı vardır;
repository ve host aynı Docker Desktop makinesindedir.

Gerçek bütçe; full backup boyutu/değişim oranı, WAL byte/sn, yedi zincir ve nesne
versiyon retention'ı, ayrı repository/secret manager, restore compute ve egress
ile kesinleştirilmeli. Örneğin 100 GiB veriyi dört saatte yalnız taşımak bile
en az 7,11 MiB/sn gerektirir; WAL replay ve operasyon süresi buna dahil değildir.
Yerel küçük fixture sonucu büyük veriye doğrusal kapasite garantisi vermez.

## Güvenlik ve operasyon runbook'u

1. Olayı kaydet; write trafiğini ve dış yan etkili worker'ları durdur. Kaynak
   kimliğini, incident zamanını, hedef zamanı ve release/migration sürümünü sabitle.
2. Güçlü MFA/JIT ile ayrı restore operatörü kullan. İkinci yetkili, tam hedef
   kimliği ve recovery point'i incident kaydında onaylasın. Admin ekranındaki
   serbest `approvalId` metni veya yerel testin onay string'i bu kontrolü ikame etmez.
3. Bağımsız repository ve secret manager erişimini doğrula. Restore identity'si
   read-only olmalı; application credential'ı backup/restore yetkisi taşımamalı.
4. Yeni/boş ve uygulama trafiğinden izole hedefi hazırla. Yanlış cluster/PGDATA'ya
   işlem yapma. Mevcut development veya production üzerine bu drill'i uyarlama.
5. İstenen full set + WAL aralığında integrity doğrula; hedef zamana restore et.
   Hedefe ulaşılamazsa FAIL bırak. Daha yeni timestamp'e sessizce geçme.
6. Schema/migration sürümünü doğrula. Object versiyonlarını kurtarılan DB
   referanslarıyla eşleştir; checksum/byte/quota kontrolünü bitir. Eksik nesne,
   tenant veya finans invariant ihlali varsa trafik açma.
7. Worker'ları önce dış provider side effect'leri kapalı incele. Expired lease,
   pending/failed outbox ve delivery receipt'lerini kontrol et. Sadece DB PITR,
   daha önce dışarı gönderilmiş mail/ödeme/e-belgeyi geri alamaz; external
   idempotency/reconciliation ayrıca doğrulanmalı.
8. Restore sonrası authenticated HTTP smoke, yeni ERP akışı ve duplicate/replay
   kontrollerini çalıştır. RPO/RTO'yu insan müdahalesi dahil incident kaydına ekle.
9. Güvenilir bağımsız audit/kanıt sink'ine sonuçları aktar. Son trafik yönlendirmesi
   ayrı canlı deployment onayı gerektirir. Başarılı test otomatik promotion değildir.

### Secret/anahtar rotation ve recovery

Cipher'ın orijinali ile offline/ayrı hesap escrow kopyası farklı erişim alanlarında
saklanmalı; kayıp veya erişim engelinde plaintext/log fallback olmamalı. Staging
tatbikatında normal secret erişimini kapatıp escrow ile gerçek restore yapılmalı.
NTFS'deki yerel test dosyalarının `mode` bayrağı Linux secret izinlerinin veya
cloud IAM'in yerine geçmez.

Rotation için yeni anahtar ve yeni repository oluştur; yeni full+WAL zincirini
doğrulayıp onaylı pencerede arşiv geçişi yap. Eski chain'lerin retention'ı bitip
artık gerekmeyecekleri doğrulanana kadar eski key/repository read erişimini koru.
Mevcut repository'nin cipher parolasını yalnız dosyada değiştirmek rotation
değildir ve eski backup'ları erişilemez yapabilir. DB/backup/storage credential
rotation'ları ayrı yürütülmeli; geri alma ve escrow retrieval ayrıca test edilmeli.

## Regresyonlar, başarısız denemeler ve kalan kapılar

| Kontrol | Sonuç / artifact |
|---|---|
| Mevcut unit | **408 PASS**: backend217/web72/mobile119; `artifacts/phase9-unit.log` |
| Gerçek PostgreSQL cross-module | **126/126 PASS**, 23 dosya, 124,48 sn; nihai koşunun `cross-module/results.json` ve `cross-module.log` dosyaları |
| DR güvenlik testleri | **4 PASS**; `artifacts/phase9-safety-final.log` |
| Release regresyonu | **18 PASS**; `artifacts/phase9-release.log` |
| Performance araç regresyonu | **15 PASS**; `artifacts/phase9-performance-tools.log` |
| Workspace typecheck | **PASS**; `artifacts/phase9-typecheck-final.log` |
| Mimari, schema, API contract, tenant, security, permission guards | **PASS**; `artifacts/phase9-guards-final.log` |
| Backend derlemesi | **PASS**; `artifacts/phase9-backend-build.log` |
| Son scripts typecheck | **PASS**; `artifacts/phase9-typecheck-scripts-last.log` |
| Yeni/değişen TS kaynak denetimi | **16 dosya; explicit any=0, unused=0**; `artifacts/phase9-source-audit.json` |
| Gerçek mixed performans regresyonu | **PASS**, 25 VU /30 ölçülen sn; `artifacts/performance/axon-perf-c78b04ba` |

Mixed koşu: 1069 HTTP /35,63 HTTP-sn; read p95 **34 ms**, write p95 **112 ms**;
ölçülen upload **45/45 HTTP201**, 409/diğer hata=0, upload p95/p99 **88/99 ms**;
WebSocket **45/45** doğrulanmış receipt, p95 **1050 ms**, socket failure=0.
Generator ölçümü valid: 25/25 cohort, event-loop p99 21,15 ms. Queue pending,
processing, failed ve dead-letter final sayaçları 0; on SQL invariant ihlali 0.
Final provider/DB count-byte mutabakatı **74 nesne /78.144 byte**, aktif reservation,
usage mismatch ve cleanup exhausted 0. Bu mutabakat kriptografik identity proof
değildir; DR dosya hash kontrolü ayrı tatbikatta yapıldı. Chromium'un login/dashboard/
products/invoices ziyaretleri HTTP200, browser failure listeleri boş.

Bu kısa regresyonda SLO'lar değiştirilmedi (read300/write800/realtime2000 ms).
Phase8.2'nin aynı API/worker/web image'ları ve 4 API ×2 CPU/1 GiB, API pool5,
worker2 CPU/1 GiB/250 ms, generator2 CPU/1536 MiB bütçesi kullanıldı; Faz9 runtime
domain kodunu değiştirmedi. DR testleri ve derlemeler load ile eşzamanlı yürütülmedi.
Yeni 30 dakikalık soak veya yeni kapasite keşfi yapılmadı. Bu sonuç, backup/WAL
aktifken production yükü veya yeni 75+ VU kapasite kanıtı olarak sunulmaz.

Nihai ana koşunun `outcome.json` dosyasında `passed`, `recoveryPassed` ve
`regressionPassed` ayrı ayrı true. Regresyon, source crash sonrası güncel bağlantıyı
kullandı. Test/raporlar skip veya eksik çıktı üzerinden başarılı sayılmadı.

Geliştirme sırasında başarısız koşular korunmuştur: Docker internal network'te
host port binding oluşmaması; ilk ERP fixture'da teslim edilmemiş siparişin
faturasının haklı olarak reddi; PostgreSQL recovery zamanının `T...Z` biçimini
reddetmesi; doğrulama aracının tenant predicate içermeyen sorgularının runtime
guard tarafından reddi. Ayrıca eski bozuk-yedek testi bir sıfır boyutlu dosyaya
denk gelmiş ve restore'u bozmamıştı; test gerçek, dolu `pg_control` payload'ını
hedefleyecek şekilde düzeltildi. Başarısız assertion gizlenmedi. Windows'ta aktif
Prisma DLL'i varken client generate EPERM verdi; testler durunca yeniden üretildi.
Hiçbir domain assertion, quota, lock/retry sınırı veya tenant guard gevşetilmedi.

Scheduler kapanışında ayrıca gerçek bir süreç yönetimi hatası bulundu. PostgreSQL
PID 1 iken scheduler'ın sinyalle sonlandırılan fakat beklenmeyen sleep çocuğu
postmaster'a devrediliyordu. PostgreSQL logu aynı child PID için signal 15 ve
`terminating any other active server processes` kaydetti; arşiv istatistikleri
resetlendi ve health FAIL oldu. `phase9-scheduler-probe-trace.log` bunu tekrar
üretti. Scheduler çocuğunu `wait` ile topluyor; DB container'ları `--init` ile
çalışıyor. `phase9-scheduler-probe-fixed.log` kapanış öncesi/sonrası aynı arşiv
sayacını ve kesilmeyen bağlantıyı doğruluyor. Sayaç eksikliği başarı sayılmadı;
resource sınırı veya health eşiği değiştirilmedi.

`axon-dr-091422de128a` koşusunun 16 DR testi geçmesine rağmen devamındaki
regresyon eski Docker portuna bağlandı. Yalnız bu owned regresyon süreci durduruldu;
sonucu PASS sayılmadı. O koşuda eski global JSON raporunun kopyalanmış olması
`cross-module-report-invalid.json` ile açıkça geçersiz işaretlendi. Araç source
restart sonrası portu yeniden okuyor ve her koşu kendi rapor dizinine yazıyor.
Sıfır test, skipped/eksik/başarısız JSON raporu veya yalnız başarılı process exit
artık genel PASS üretmez; yeni güvenlik testi bunları reddettiğini doğruluyor.

Staging/pilot öncesi açık zorunluluklar:

- Ayrı host/account/bölgede gerçek repository ve dar IAM; workload identity,
  immutable retention ve bağımsız audit/alert sink doğrulaması.
- Gerçek provider'da object version/key manifest recovery; eksik/erişilemeyen
  nesne ve replication-lag tatbikatı; DB/WAL penceresiyle uyumlu retention.
- Staging release/migration sürümünün backup'tan gerçek restore'u; gerçek HTTP ve
  kritik ERP E2E; dış provider replay/idempotency mutabakatı.
- Source host kaybı, repository ağ kesintisi/dolması, secret manager erişim kaybı
  ve operatör onay/escrow erişim süresi dahil RPO/RTO ölçümü.
- Gerçek veri büyüklüğü ve yoğun yazma sırasında WAL lag, backup overhead ve
  restore throughput; maliyet/retention onayı ve bağımsız watchdog alarmı.

Bu kapılar geçilmeden Faz 9 için koşulsuz PASS veya production DR hazır beyanı
verilmez. Faz 8.2'nin önceki yerel kapasite kanıtı ve sınırlamaları aynen korunur.

## Faz 9 tekrar incelemesi — 2026-11-18

İnceleme, mevcut uygulama runtime'ını değiştirmeden DR araçları ve restore
doğrulamasındaki hata yollarını güçlendirdi. Finans/stok/audit/outbox domain
kodunda, uygulama endpoint'lerinde veya production veritabanında değişiklik yok.

| Bulgu | Düzeltme ve doğrulama |
|---|---|
| Sıfır kontrol edilen dosya/WAL veya checked/valid toplamı tutarsız çıktı eski parser tarafından kabul ediliyordu | Pozitif ve eşit toplamlar, tüm hata sayaçları ve istenen backup seti birlikte doğrulanıyor; eksik/başka sete ait çıktı reddediliyor |
| Backup metadata sırasına güveniliyor, kesirli/negatif değerler yeterince sınanmıyordu | Güvenli tamsayı, benzersiz backup kimliği, tarih sırası ve en yeni completed set seçimi; future backup ve geçersiz archiver sayaçları health PASS üretemiyor |
| Diagnostic yazımı veya ilk cleanup hatası sonraki temizlik adımlarını atlatabiliyordu | Ortak `finalization.ts`; her adım hata verse de kaynak ve tüm secret temizliği deneniyor. Her kaynak temizliği bağımsız deneniyor. Genel sonuç cleanup sonrasında yazılıyor; hatada `passed=false` / `finalizationPassed=false` |
| Restore sonrası verifier yalnız DB adı/localhost ve JSON string tiplerine güveniyordu | Dosya okunmadan owned expectation path kontrolü; object/output path ve tenant-key sınırları; restore edilen DB'deki `axon_dr.identity` owner eşleşmeden HTTP veya mutation çalışmıyor |
| Scheduler yalnız sleep aşamasındaki çocuğunu takip ediyordu | Aktif check/backup/expire işi de takip ediliyor; TERM aktif timeout/job'u durdurup wait ile topluyor. Gerçek backup sırasında iptal, kilitlerin bırakılması ve sonrasında yeni backup test edildi |
| Systemd timeout'u yalnız Docker istemcisini durdurabilirdi | Service örneğinde timeout container içindeki komuta da uygulanıyor; check/backup/expire için toplam host bütçesi içinde ayrı sonlandırma sınırları var. Linux systemd adoption'ı staging kapısı olarak kalır |
| `pg_isready` kısa read-only recovery aralığında başarılı olabiliyor | Restore readiness, 15 sn bounded promotion beklemesiyle `pg_is_in_recovery()=false` olmasını doğruluyor; yanlış/normalize edilmiş/boş recovery zamanı reddediliyor |

`axon_dr.identity` yalnız yeni ve owned test cluster'ında, uygulamanın public
şemasının dışında oluşturulur. Fiziksel/PITR backup ile korunur. Production için
yeni migration veya canlı şema değişikliği değildir. Ayrı gerçek PostgreSQL
testinde marker başka owner'a çevrildiğinde ve tamamen kaldırıldığında verifier
başarısız oldu; payment, processing outbox ve cleanup kayıtları değişmedi.

Yeni güvenlik testlerinde diagnostic disk hatası, Docker cleanup hatası, outcome
yazma hatası ve tek bir secret unlink hatası enjekte edildi. Kaynak/secret
adımlarının atlanmadığı ve erken PASS yazılmadığı doğrulandı. Bu hata enjeksiyonu
unit'leri gerçek Docker/PostgreSQL kurtarma testleriyle birlikte çalıştırıldı.

| Tekrar kontrol | Sonuç ve kanıt |
|---|---|
| Gerçek DR | **18/18 PASS**; `artifacts/disaster-recovery/axon-dr-d6677d158a77/vitest.json` |
| Gerçek PostgreSQL cross-module | **126/126 PASS**, 23 dosya, 139,12 sn; aynı koşunun `cross-module/results.json` |
| Genel sonuç ve temizlik | `outcome.json`: `passed`, `recoveryPassed`, `regressionPassed`, `finalizationPassed` true |
| Gerçek scheduler iptali | `measurements.json`: `duringRealBackup`, `stopped`, `subsequentBackupPassed` true |
| DR safety | **10/10 PASS**; `artifacts/phase9-review-safety.log` |
| Mevcut unit | **408 PASS**: backend217/web72/mobile119; `artifacts/phase9-review-unit.log` |
| Release / performance tools | **18 /15 PASS**; `artifacts/phase9-review-{release,performance-tools}.log` |
| Workspace / backend / scripts tip kontrolleri | **PASS**; `artifacts/phase9-review-typecheck-*.log` |
| Mimari / security / tenant / contract / permission guards | **PASS**; `artifacts/phase9-review-guards.log` |
| Backend build | **PASS**; `artifacts/phase9-review-build-backend.log` |
| Kaynak kalite denetimi | **18 TS dosyası; explicit any=0, unused=0**; `artifacts/phase9-review-source-audit.json` |

Docker diagnostic komutunun nonzero dönmesi de fail closed ele alınıyor.
Gerçekte bulunmayan rastgele bir owned source için diagnostic probe çalıştırıldı:
`artifacts/phase9-review-missing-source.log`. Diagnostic hatası sonrası cleanup
denendi ve genel PASS yazılmadı. Son safety tekrarı
`artifacts/phase9-review-safety-final.log` içinde; 10/10 başarılı.

İnceleme ana koşusunda kontrollü PITR RPO **1,667 sn**, gerçek HTTP/ERP doğrulamalı
yerel RTO **19,371 sn**. Test image'ı
`sha256:7c0354c6e3395168d02804b344ebca9638bea970d47ecfa4e5e963a7a11f62ec`;
PostgreSQL17.12 /pgBackRest2.60.1, 2 CPU/1 GiB DB sınırı korunuyor.

Ek otomatik WAL tekrarı
`artifacts/disaster-recovery/axon-dr-f5cfc1bf5fd3/automatic-wal.json`: marker sonrası
zorlanmış flush olmadan, source SIGKILL sonrası PITR **PASS**; otomatik RPO
**60,681 sn**, fiziksel RTO **7,889 sn**. Ayrı fixture'ların süreleri production
kapasite garantisi olarak birleştirilmedi. Önceki 25 VU mixed kanıtı tarihçede
korundu; bu incelemede yeni soak/kapasite ölçümü yapılmadı.

**Güncel karar: CONDITIONAL PASS.** İncelenen kod ve çalıştırılan yerel
regresyonlarda açık bir kırık akış kalmadı; ayrı host/IAM/provider ve gerçek
staging restore kapıları devam ediyor. Bu sonuç sıfır güvenlik açığı veya
production DR garantisi iddiası değildir.
