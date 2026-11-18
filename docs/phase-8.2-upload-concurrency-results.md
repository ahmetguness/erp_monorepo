# Faz 8.2 — Upload eşzamanlılığı

**Karar: CONDITIONAL PASS.** Upload altyapı 409'u kök neden düzeyinde giderildi. Aynı bütçede 4 API/75 VU ile tam 1800 saniyelik mixed soak bütün koşulları geçti: **7269/7269 upload HTTP201**, beklenmeyen HTTP hata=0, 7196/7196 teslim, SQL invariant ve yük sonu aktif rezervasyon=0. Güvenilir yerel mixed kademe 75 VU'dur. Mixed100 ve upload75/100 gecikme sınırlarını aşmaya devam eder; 1750/2500 veya production kapasitesi onaylanmaz.

## Kapsam ve başlangıç kanıtı

`phase-8-optimization-results.md` ve ilgili `artifacts/performance/axon-perf-ee61d1e4/` JSON/log/SQL/kaynak kanıtları incelendi. Faz 8.1'de 4 API/75 VU, 1800 ölçülen saniye mixed soak: 176269 HTTP, 7290 upload, 101 upload HTTP409, read p95 223 ms, write/upload p95 741 ms, upload p99 1301 ms; 7233/7233 teslim ve SQL invariant'ları başarılıydı. Bu eski koşu FAIL olarak korunur.

Çalışma yalnız sentetik veri ve izole PostgreSQL/Docker kullanır. Production/staging bağlantısı, müşteri credential'ı, commit/push veya deployment yapılmadı. Finans, stok, audit/domain outbox kodu değiştirilmedi. `a.md` ignore kapsamında kalır.

Eski koşunun 50 artifact dosyası okunup JSON'ları parse edildi (`phase82-prior-artifact-review.json`). Son `database.json` içinde **bir tenant'ta 1056 byte rezervasyon kalmıştı**. `invalidStorageAccounting=0` bu kalıntıyı yakalamaz: mevcut SQL yalnız reserved toplamının aktif rezervasyon toplamına eşitliğini kontrol ediyordu. Kaydın RESERVED/UPLOADED/SCANNING ayrımı eski snapshot'ta bulunmuyor; hangi adımda kaldığı iddia edilmez. Son provider storedBytes ile DB usedBytes toplamları aynıydı (8403648 byte); bu yalnız sayısal mutabakattır. Yeni harness yük bittikten sonra aktif rezervasyonun sıfır olmasını da ayrıca kontrol eder.

## Kanıtlanan kök neden

Eski `StorageReservationService.reserve` önce `upsert(update:{})` ile Serializable snapshot'ı başlatıyor, ardından ortak `tenant_storage_usage` satırını `FOR UPDATE` ile kilitliyordu. Başka bir upload bu satırı arada güncellediğinde, kilidin beklenmesi snapshot'ı yenilemiyordu: PostgreSQL `40001`, Prisma raw SQL için `P2010` döndürüyordu. Commit ise rezervasyonu okuduktan sonra aynı kullanım satırını güncellerken ORM `P2034` alıyordu. Release yolunda da aynı çatışma gözlendi. Beş sınırlı deneme tükenince genel `CONFLICT`/HTTP409 oluşuyordu.

Bu yüzden aynı tenant'ın bağımsız, farklı object key'li upload'ları gerçek kullanıcı sürüm çatışması olmadan birbirini reddedebiliyordu. `Read Committed` kilitli okumada güncel satır sürümünü döndürür; Serializable sabit snapshot davranışı farklıdır. [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html), [row locks](https://www.postgresql.org/docs/17/explicit-locking.html).

Kanıtlar:

- `artifacts/phase82-upload-before.json`: yalnız storage yollarına eklenen gözlem, reserve `usage_lock` adımında `P2010/40001`, commit `usage_update` adımında `P2034` ve hangi işlemin beş denemeyi tükettiğini kaydeder. Release geçici hataları da görünürdür. Alanlar operation/step/attempt/süre/kod ile sınırlıdır; dosya içeriği, credential ve SQL bind değerleri kaydedilmez.
- `phase82-postgres-before.log`: gerçek PostgreSQL `ERROR: 40001: could not serialize access due to concurrent update`; kullanım satırını kilitleyen/güncelleyen statement'lar. Bu log yalnız disposable DB'ye aittir.
- Cross-module testi, snapshot alındıktan sonra başka bağlantının aynı satırı güncellemesini deterministik olarak sıralar: Serializable `P2010/40001`, Read Committed güncel satırla başarı.
- Eski 101 HTTP409'un her birini reserve/commit olarak geriye dönük ayıracak span yoktu. Yeni yeniden üretim iki adımın da bu hatayı ürettiğini kanıtlar; eski 101'in dağılımı uydurulmadı.

## Güvenli çözüm

Storage muhasebesi kendine ait kısa `Read Committed` transaction kullanır; tüm reserve/commit/release yolları **kullanım satırı → rezervasyon satırı** sırasını izler. Tenant sınırı raw SQL için de doğrulanır. Kota kabulü kilitli güncel satırda `used + reserved + expected <= limit` koşuluyla yapılır. Commit aynı miktarı reserved'dan used'a aktarır; release yalnız aktif durumdan bir kez düşer. Başka resource'a bağlama ve gerçek dosya sürümü çatışmaları reddedilir. Finansın mevcut Serializable/retry yardımcısı değiştirilmedi.

Yeni storage yardımcısında callback retry'ı yoktur. Pool alma `maxWait=2000 ms`, transaction `timeout=5000 ms`, PostgreSQL lock timeout `1500 ms`, statement timeout `4000 ms`. Bunlar SLO artışı değildir; HTTP read/write sınırları 300/800 ms olarak kalır. Kontrollü kilit testinde `55P03` yaklaşık 1,5 sn'de görünür hata olarak döner. Step süresi client round-trip ve lock beklemesini birlikte içerir; saf PostgreSQL lock wait gibi sunulmaz. PG lock logları yalnız 100 ms üzeri beklemeleri kapsar.

ERP akışı: HTTP güvenlik taraması → reserve → provider PUT → **tek DB transaction içinde metadata + kota commit + upload trafik sayacı**. Provider I/O kilit tutmaz. Metadata callback'i transaction client alır; ayrı rollbackMetadata yazıları kaldırıldı. Trafik kaydı hatası artık başarılı metadata/kota commit'inden sonra dosyayı silen bir catch'e düşmez; bütün DB değişiklikleri birlikte rollback olur. Commit sonucunun belirsiz olduğu durumda doğrulanmış COMMITTED rezervasyonun nesnesi korunur.

Chat worker aynı accounting commit yolunu kullanır; READY metadata, byte dönüşümü ve trafik aynı transaction'dadır. Taraması bitmemiş chat dosyası görünür yapılmaz. Plan, MIME/boyut, tenant ve yetki kontrolleri korunur.

## Orphan cleanup ve recovery

Rezervasyon, provider PUT'tan önce kalıcıdır. Başarısız/expire edilmiş işlem kota rezervasyonunu bırakırken kalıcı cleanup işareti oluşturur. Anlık delete başarısız olsa veya süreç kapansa da object key DB'de kalır. Immediate delete sonrası da gecikmeli doğrulama korunur; belirsiz provider PUT sonucu için dosya anahtarı unutulmaz.

Additive migration `20261118120000_storage_cleanup_recovery`: `cleanupAfter`, `cleanupAttempts`, `cleanupCompletedAt` ve bir indeks; eski terminal rezervasyonlar da temizleme adayına alınır. Worker tur başına en fazla 25 aday, 60 sn claim lease ve en fazla 5 delete denemesi kullanır. Tükenmiş kayıt DB'de görünür kalır ve exhausted uyarısı üretir; otomatik sınırsız retry yoktur. Provider geri geldikten sonraki operatör replay'i ayrıca kontrollü yapılmalıdır. COMMITTED nesne cleanup adayı değildir. Eski ERP SCANNING rezervasyonu expire olursa yalnız kendi key/resource eşleşmesindeki uncommitted metadata temizlenir.

Gerçek child süreç provider PUT sonrası `SIGKILL` ile kapatıldı. Yerel dosya kaldı, metadata oluşmadı, 1024 byte rezervasyon korundu. Expiry sonrası sayaç 0 oldu; ilk delete hata enjeksiyonundan sonra yeni recovery çağrısı dosyayı sildi. Kanıt: `phase82-recovery-fixed.log`, toplu cross-module logu ve `upload-recovery.test.ts`. Bu test gerçek process ölümüdür; provider ise sentetik yerel dosya deposudur.

Kota üç planda ERP/chat ortak 10 KiB sınırında 25 yarışmacıyla doğrulandı: 10 kabul, 15 gerçek kota reddi; release sonrası reserved=0. Çift commit 25 çağrıda tek byte/traffic etkisi üretir; çift release ikinci kez düşmez. Aynı mantıksal dosya sürümünün iki gönderimi halen 201/409 olur ve bir nesne/bir kota kaydı bırakır. Metadata ve trafik-trigger hata enjeksiyonları rollback/cleanup'ı doğrular. Scanner ret/503 testleri reserve ve provider PUT öncesinde reddeder.

## İzole bileşen karşılaştırması

Aynı tenant'a tek seferde 25/50/75/100 çağrı; gerçek PostgreSQL 17 (2 CPU/1 GiB), native Node, 20 bağlantı, 2 ms PUT beklemesi olan sınırlı bellek provider'ı. Bu **HTTP kapasite testi değildir**; auth/proxy/malware scan dahil değildir. Eski ve yeni probe aynı veri şekli, object boyutu ve bütçeyi kullanır; ikinci koşuda önceki metadata kalır. Eski hata yanıtlarının hızlı dönmesi ile yeni bütün işlemlerin bitmesi süre karşılaştırmasını sınırlar.

| Eşzamanlı upload | Önce hata | Sonra hata | Önce p95/p99 ms | Sonra p95/p99 ms |
|---:|---:|---:|---:|---:|
| 25 | 18 | 0 | 693,79 /719,71 | 1313,61 /1330,63 |
| 50 | 41 | 0 | 698,42 /797,00 | 1542,49 /1567,99 |
| 75 | 62 | 0 | 855,28 /917,91 | 2076,61 /2125,56 |
| 100 | 84 | 0 | 1063,17 /1158,32 | 2524,57 /2626,52 |

Süreler hata dahil bütün çağrıların süresidir. Yeni sonuç, “daha düşük p95” diye sunulmaz; burada kanıt sıfır altyapı çatışması ve doğru son durumdur. SLO kapasitesi ayrıca gerçek Docker/HTTP profillerinden değerlendirilir.

Eski probe'da beş deneme tükenmeleri reserve/commit için sırasıyla 18/0, 36/5, 58/4, 78/6; release'te tükenme yok, geçici çatışmalar var. Yeni probe callback başına tek transaction kullanır ve bu dalgaların tamamında database failure örneği 0'dır. Kilitli okuma ve transaction sürelerinin bounded histogramları `phase82-upload-after.json` içindedir; p95 üst sınırları bucket tahminidir.

| Eski probe eşzamanlılığı | Reserve callback yeniden denemesi | Commit callback yeniden denemesi | Release callback yeniden denemesi |
|---:|---:|---:|---:|
| 25 | 85 | 7 | 0 |
| 50 | 174 | 37 | 8 |
| 75 | 263 | 52 | 5 |
| 100 | 351 | 66 | 11 |

Bu sayılar attempt sayaçlarından mantıksal çağrı sayısı çıkarılarak hesaplandı; başarısız callback yürütmeleri de dahildir. 100'lü dalgada eski toplam 556 transaction attempt'e karşı yeni 200 transaction (100 reserve +100 commit) vardır. Eski dalga yalnız 16 upload tamamladığından aynı miktarda başarılı iş yaptığı varsayılmaz. Yeni storage callback yeniden denemesi 0'dır.

## Yeniden performans ölçümü

### Eş kaynaklı gerçek HTTP upload profili

Önce `d75cd533` (`phase81-release` backend), sonra `9f471852` (`phase82` backend). İki koşuda migrator ve web image kimlikleri, kaynak bütçesi, 150 tenant/750 aktör fixture boyutu ve 4 API/pool5 eşittir; otomatik karşılaştırma bunu doğruladı. Aynı additive şema yeni migrator ile uygulanır. 20 sn ramp +10 sn warmup +30 sn ölçüm, think1000 ms, profiling kapalı. API replica başına 2 CPU/1 GiB, PG2 CPU/1 GiB, worker2 CPU/250 ms, proxy0,5 CPU/256 MiB, generator2 CPU/1536 MiB; aynı 12 CPU/yaklaşık 7,68 GiB Docker hostu. QA PostgreSQL ve derlemeler bu ölçüm boyunca durduruldu.

Upload profili gerçek multipart upload, enforce modundaki sentetik malware scanner, S3 uyumlu ağ provider'ı ve korumalı download içerir; tenant sınırı probe'ları korunur. Ayrı profil eklenmesi mixed senaryodan işlem çıkarmadı. Sayılar yalnız ölçüm penceresine aittir; hatalar histogramdan çıkarılmadı.

| Backend /kanıt | VU | Upload denemesi | HTTP201 | HTTP409 | Diğer hata | Upload p95/p99 ms | Ölçüm | Toplam sonuç |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Önce /`d75cd533` | 25 | 587 | 508 | 79 | 0 | 636/1158 | geçerli | FAIL |
| Önce /`d75cd533` | 50 | 1047 | 526 | 521 | 0 | 962/1321 | geçerli | FAIL |
| Önce /`d75cd533` | 75 | 1536 | 529 | 1007 | 0 | 792/1106 | geçerli | FAIL |
| Önce /`d75cd533` | 100 | 1689 | 325 | 1364 | 0 | 1765/2426 | geçerli | FAIL |
| Sonra /`9f471852` | 25 | 669 | 669 | 0 | 0 | 219/426 | geçerli | PASS |
| Sonra /`9f471852` | 50 | 1153 | 1153 | 0 | 0 | 758/1014 | geçerli | PASS |
| Sonra /`9f471852` | 75 | 1172 | 1172 | 0 | 0 | 1271/1441 | geçerli | FAIL |
| Sonra /`9f471852` | 100 | 1519 | 1519 | 0 | 0 | 1408/1904 | geçerli | FAIL |


Yeni dört kademede de beklenmeyen HTTP yanıtı **0**. Bununla birlikte 75/100 VU upload p95'i 800 ms'yi aştığından bu kademeler **FAIL**; 409'un bitmesi SLO başarısı olarak sunulmadı. Upload ağırlıklı profil için kısa koşuda en yüksek tam PASS 50 VU'dur; bunun 30 dakika upload-only soak'ı yapılmadı. Aynı kaynakta yalnız replica sayısını artıran bir düzeltme kullanılmadı.

Eski koşunun yük sonu mutabakatı: provider/metadata 3771 nesne /3982176 byte ile eşleşse de **255 aktif rezervasyon** kalmış, sonuç FAIL. Eski `invalidStorageAccounting=0` bu kalıntıları yine kaçırır. Yeni koşu: **8258 nesne /8720448 byte**, aktif rezervasyon=0, used-byte/metadata uyuşmazlığı=0, cleanup exhausted=0; mutabakat PASS. Bu sayılar ramp/warmup dahil bütün koşunun son durumudur; ölçülen pencerenin upload sayılarıyla karıştırılmaz. Mutabakat sayısaldır; exact-key cleanup doğruluğu ayrı recovery testlerinde denetlenir.

Yeni API'lerin örneklenen lifecycle sayaçlarında 8258 reserve +8258 commit, storage database failure=0; callback retry=0. Aşağıdaki transaction süreleri pool/client maliyetini içerir, PostgreSQL'in yalnız execution süresi değildir:

| İşlem | Ortalama/max transaction ms | Ortalama/max usage-lock adımı ms |
|---|---:|---:|
| Reserve | 68,99 /659,08 | 12,91 /420,31 |
| Commit | 93,39 /786,72 | 13,76 /373,02 |

Bu ortalamalar bütün lifecycle'daki process sayaçlarından türetilir; steady-window p95 veya salt lock wait değildir. Release çağrısı gerekmeyen başarılı upload koşusunda release sayacı yoktur; release süreleri kontrollü hata/cleanup testleriyle doğrulandı. Eski API'de bu yeni sayaçlar yoktur, sıfır olarak kıyaslanmadı.

Son bounded PG log snapshot'ı eski koşuda 194 adet `40001` satırı içerir. Yeni upload koşusunun aynı tür son logunda ERROR SQLSTATE yok; 100 ms eşiği üzerinde 113 lock acquisition kaydı ve en çok 292,37 ms gerçek loglanmış bekleme vardır. Bunlar son 1000 satırlık logun gözlemleridir, bütün koşu hata/bekleme toplamı değildir. Dosyalar `upload-baseline-postgres.log` ve `storage-runtime-summary.json`.

### Mixed keşif ve 1800 saniyelik soak

| Profil | VU | Saniye | HTTP/sn | Read p95 ms | Write p95 ms | Upload 409/deneme | Teslim /beklenen | Teslim p95 ms | Queue | Ölçüm | Sonuç |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| mixed | 25 | 30 | 35.03 | 50 | 189 | 0/44 | 45/45 | 1055 | PASS | geçerli | PASS |
| mixed | 50 | 30 | 70.07 | 38 | 162 | 0/85 | 88/88 | 1014 | PASS | geçerli | PASS |
| mixed | 75 | 30 | 104.23 | 51 | 203 | 0/131 | 130/130 | 1059 | PASS | geçerli | PASS |
| mixed | 100 | 30 | 103.27 | 1187 | 1937 | 0/132 | 127/127 | 1253 | PASS | geçerli | FAIL |
| soak | 75 | 1800 | 97.45 | 266 | 696 | 0/7269 | 7196/7196 | 1047 | PASS | geçerli | PASS |


Yeni mixed koşu **`6918e837`**: fresh fixture, upload karşılaştırmasındaki yeni backend/migrator/web image kimlikleri ve bütçe aynen korunur (`phase82-image-budget-evidence.json`). 100 VU'nun p95 FAIL'i nedeniyle harness, geçen en yüksek mixed kademe **75 VU**'yu otomatik seçti; `PERF_SOAK_STAGE` override edilmedi.

Soak **1800 ölçülen saniye**, toplam lifecycle 1836,03 sn; ramp/warmup ve teslim grace'i ölçülen HTTP/sn paydasına eklenmez. **175410 HTTP /97,45 HTTP-sn**, beklenmeyen yanıt/5xx/transport/429=0. Upload **7269 deneme, 7269 HTTP201, 0 HTTP409**; p50/p95/p99 **124/677/1130 ms**. Hata yanıtı başarılı kabul edilmedi, iş akışı çıkarılmadı.

| Aynı 75 VU/4 API/1800 sn | Faz 8.1 `ee61d1e4` | Faz 8.2 `6918e837` |
|---|---:|---:|
| Upload denemesi | 7290 | 7269 |
| Upload HTTP409 | 101 | **0** |
| Upload p95/p99 ms | 741/1301 | **677/1130** |
| En kötü read p95 ms | 223 | 266 |
| En kötü write p95 ms | 741 | 696 |
| Doğrulanan/beklenen WS alımı | 7233/7233 | 7196/7196 |
| Yük sonu reserved byte | 1056 | **0** |
| İş akışı sonucu | FAIL | **PASS** |

Tekrarların gerçek HTTP sayısı aynı değildir; closed-loop hız ve host değişkenliği korunur. Read p95 artmıştır ama 300 ms sınırının altındadır. Bu tablo bütün endpoint'lerde tek tip hızlanma iddiası değildir.

| Kabul koşulu | Yeni soak sonucu | Karar |
|---|---|---|
| Read p95 <300 ms | En kötü 266 ms | PASS |
| Write p95 <800 ms | En kötü 696 ms; upload677 ms | PASS |
| 5xx/transport <%0,5 | 0 /175410 | PASS |
| Başarılı iş akışları | Bütün beklenmeyen HTTP hata=0; 429=0 | PASS |
| Realtime bağlantı | 75/75 VU hazır, 15 socket, socket failure0 | PASS |
| Realtime p95 <2000 ms | Doğrulanmış p95 1047 /p99 1115 /max1553 ms | PASS |
| Eksiksiz WS teslim | 7196/7196; eksik/overflow0 | PASS |
| SQL invariant | 10 sayacın tamamı0 | PASS |
| Ortak ERP/chat kota yarışı | Üç planda10 kabul/15 kota reddi; son rezervasyon0 | PASS |
| Kuyruk FAILED/DEAD_LETTER | Tüm örneklerde0 | PASS |
| En eski kuyruk işi <=30 sn | Soak boyunca örneklenen tepe10,71 sn | PASS |
| Kesintisiz süre ve generator | 1800 sn; p99 loop30,49 ms, max progressgap10,033 sn | PASS |
| Yük sonu storage mutabakatı | 8012 nesne /8460672 byte; activeReservation/usageMismatch/exhausted0 | PASS |

184 soak kaynak örneği, unavailable0. PG bağlantı tepesi27, lock waiter8, deadlock0, API pool timeout process counter maksimumu0. En eski açık transaction örneği1,235 sn. API process event-loop p99 örnek tepesi42,21 ms; process histogramı keşifleri de içerir. API RSS ilk/son değerleri 161,07→169,27; 161,18→168,51; 162,07→169,54; 162,29→173,12 MiB, tepe173,74 MiB. Bu, sınırsız süre için sıfır sızıntı garantisi değildir. DB boyutu soak örnekleri arasında60.634.803→262.583.987 byte büyüdü.

Son lifecycle storage metrikleri 8012 reserve +8012 commit /failure0; retry0. Reserve transaction ortalama/max41,50/551,68 ms, lock-step4,57/244,08 ms. Commit transaction62,66/885,03 ms, lock-step4,42/367,50 ms. Bunlar keşifler dahil process sayaçlarıdır; soak-only percentile değildir. Son bounded PG logunda ERROR SQLSTATE yok; 100 ms üstü143 acquisition kaydı, en uzun loglanmış lock wait620,917 ms vardır. 1500 ms deadline artırılmadı.

Son drain sonrası pending/processing/failed/dead-letter=0; 23736 işlenmiş durable event keşif+soak+drain toplamıdır. Dört ardışık Chromium gezinmesi (login→dashboard, dashboard, products, invoices) HTTP200 /failures=[]; bu, eşzamanlı browser kapasitesi değildir. Mutabakat, SQL ve browser dosyaları tamamlandı. Controller, keşifteki100 VU FAIL'ini gizlemek için sıfır çıkışa çevrilmedi; **soak75 sonucu bağımsız PASS**, tüm kademeler PASS değildir.

## Değiştirilen dosyalar

| Yerleşim | Değişiklik |
|---|---|
| `prisma/schema/storage-usage.prisma`, `20261118120000_storage_cleanup_recovery/migration.sql` | Kalıcı bounded cleanup alanları, indeks ve terminal kayıt backfill'i |
| `modules/storage-accounting/application/{storage-reservation.service,storage-transaction,storage-transaction-telemetry,accounted-object.service,index}.ts` | Kilit sırası, kısa transaction, atomic metadata/accounting/traffic, bounded güvenli gözlem ve public telemetry export |
| `storage-accounting/infrastructure/{chat-attachment.worker,storage-object-recovery}.ts` | Ortak commit, ERP/chat expiry ve claim/lease ile sınırlı object cleanup |
| `inventory/http/controllers/attachment.controller/upload.ts` | Metadata yazıcısının transaction client kullanması; ayrı rollback yazıcısının kaldırılması |
| `platform/application/observability/prometheus-exporter.ts` | Sabit boyutlu storage timing/failure sayaçları |
| `apps/backend/scripts/performance/{upload-contention,telemetry}.ts` | Gerçek PG bileşen probe'u ve cleanup durum gözlemi |
| `packages/types/src/performance.ts`, `scripts/performance/{config,scenarios,local,storage-reconciliation}.ts` | Ayrı upload profili; mevcut mixed akışı korunarak PG logu ve yük sonu sayısal storage mutabakatı |
| `tests/cross-module/scenarios/upload-{concurrency,recovery}.test.ts`, support fixture/child; `tests/unit/runtime/storage-transaction.test.ts` | Concurrency, kota, SQLSTATE, rollback, duplicate, scanner, gerçek process kill ve cleanup sınırları |

Metadata yazıcılarının tamamı incelendi; finans/stok/audit/outbox servislerinde değişiklik yok. Reddedilen eski instrumentation yalnız ignore edilen artifact'ta saklandı; kullanılmayan eski retry yardımcısı storage üretim yolunda bırakılmadı.

## Regresyon ve sınırlamalar

- Unit: 408 (backend217/web72/mobile119) PASS.
- Gerçek PostgreSQL cross-module: son izole kontrol koşusunda **126 /23 dosya PASS** (`phase82-cross-isolated.log`); yeni upload/recovery kontrolleri dahil. Önceki 124-testlik koşu da geçmişti.
- Güvenlik/mimari/contract/tenant/permission kapıları PASS. İlk statik tenant kontrolü spread içindeki tenantId'yi göremedi; create verisi alan alan açık yazılarak düzeltildi, kontrol gevşetilmedi.
- Release 18 ve mevcut performans araç testi 15 PASS. Production API/worker/migrator image'ları derlendi.
- İlk recovery denemesi DB yeniden başlarken çalıştırıldığı için setup'ta başarısız oldu; bir sonraki deneme Windows child `--import` path biçiminde hata verdi. Path file URL olarak düzeltildi, typed spawn kullanıldı; gerçek kill/recovery testi daha sonra geçti. Bu başarısız loglar saklandı.
- İlk eski-image HTTP karşılaştırması (`982e49e3`) migration sürümü uyuşmazlığı nedeniyle readiness'de durdu; yük başlamadı, kapasite sonucu değildir. Karşılaştırmalar aynı additive schema'ya sahip yeni migrator ve farklı backend image'larıyla yapılır; readiness kapatılmadı.
- Son kontrat koşusunun bir tekrarında image build ile birlikte çalışan native 100-upload testinde `P2028`/2 sn transaction alma deadline'ı doldu: 125 PASS /1 FAIL. Log `phase82-cross-release-contract.log` saklandı. Aynı kod/deadline ile ek derleme olmadan yapılan kontrol koşusunda 100-upload testi geçti; build'in tek neden olduğu iddia edilmez. Bu native test sonucu Docker kapasitesi olarak kullanılmaz. Tam kontrol koşusunun nihai sonucu aşağıda ayrıca belirtilir.
- Tam kontrol: 126/126 PASS, callback retry veya süre artırımı yapılmadı. Tüm workspace tip kontrolleri PASS (`phase82-typecheck-final.log`); kaynak audit'inde 21 değişen TS dosyasında explicit `any`/kullanılmayan bildirim yok (`phase82-source-audit.json`).

SLO'lar ve mixed senaryodaki finans/stok/ödeme/replay/upload/download/chat/tenant sınırı iş akışları korunur. Generator closed-loop ve aynı fiziksel hosttadır. Native bileşen ve in-process HTTP entegrasyon testleri concurrency doğruluğunu gösterir; Docker kapasitesi olarak sunulmaz. Provider simülatörü gerçek S3/AV kapasitesini temsil etmez. 1750/2500 hedefleri bu aşamada yeniden çalıştırılmadı; önceki başarısız/INVALID sonuçları geçerli başarıya çevrilmez.

## Açık kalan darboğazlar ve uygulama sınırı

- Upload ağırlıklı 75/100 VU'da HTTP p95 sınırı aşılıyor; 409'un sıfırlanması bunu çözmüş sayılmaz. Aynı tenant kota satırının sıralaması korunur, ölçülen lock beklemeleri ortadan kalkmış gibi gösterilmez.
- Mixed/100 kısa keşifte read p95 1187 ms ve write p95 1937 ms ile FAIL; HTTP hata ve teslim kaybı 0 olsa da bu kademe onaylanmaz. Kalan toplam HTTP süresine ek span olmadan tek bir CPU/SQL/provider nedeni atanmadı.
- Kaynaklar aynı Docker Desktop hostunda paylaşılır. Yüksek hedef, ayrı generator/staging, gerçek veri hacmi/roller/provider ve tam tarayıcı kapasitesi doğrulaması bekler. Mevcut local worker250 ms ayarı production varsayılanının kapasite kanıtı değildir.
- Cleanup delete denemeleri beşle sınırlıdır. Uzun provider kesintisinde exhausted kayıtların operatör tarafından görünür biçimde ele alınması gerekir; otomatik sınırsız retry yoktur.
- Migration boş izole DB'de gerçek migrator ile ve eski şema üzerine test DB'sinde doğrulandı. Gerçek geliştirme/production veritabanına uygulanmadı. Additive kolon/index/backfill için uygun migration penceresi ve hedef ortam doğrulaması gerekir; production rolling deployment bu testlerin kapsamında değildir.
- Native testte eşzamanlı build sırasında görülen transaction acquisition deadline, kaynak rekabetinin etkisini ayrıca gösterir. Deadline uzatılmadı; yalnız temiz ortamda geçen testten bütün koşullarda başarı garantisi çıkarılmaz.

## Güvenilir kapasite ve Faz 9 kararı

**CONDITIONAL PASS:** Faz 8.2'nin hedefi olan geçici storage 409'u giderildi; aynı yerel bütçede **75 mixed VU /1800 sn** bütün kabul koşullarıyla doğrulandı. Finans/stok/audit/outbox güvenliği değiştirilmedi. Bu, 75 gerçek tarayıcı oturumu, herhangi tenant/rol dağılımı veya production trafik garantisi değildir. Upload ağırlıklı profilde yalnız25/50 kısa kademeleri SLO PASS; upload75/100 ve mixed100 FAIL olarak kalır.

Faz 9'un izole backup/restore/DR çalışmalarına bu sınırlı kapasite kanıtıyla geçilebilir. Daha yüksek hedef veya production pilot kapasitesi için gerçekçi staging ve ayrı generator doğrulaması gerekir. Ölçülen read266 ms ve write696 ms değerleri 300/800 ms sınırlarına yakındır; yük/fixture/bütçe değiştiğinde tekrar ölçüm gerekir. Migration yalnız test DB'lerine uygulanmıştır; hedef ortam deployment'ı yapılmamıştır.

Son backend/scripts tip kontrolleri, güvenlik/mimari suite ve15 performans araç testi tekrar PASS (`phase82-typecheck-*-last.log`, `phase82-guards-last.log`, `phase82-harness-last.log`). Son kaynak audit'i21 TS dosyasında explicit `any` ve kullanılmayan bildirim0 (`phase82-source-audit-last.log`).
