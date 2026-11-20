# Faz 10 — Observability ve operasyon

19–20 Kasım 2026. **Karar: FAIL — performans kabulü geçmedi.** Kod ve yerel
işlevsel/operasyon kontrolleri uygulandı; güvenilir kapasite doğrulanamadı.
Son yük ölçümü kullanıcı isteğiyle durduruldu. Production veya staging kabulü
olarak kullanılamaz; başarısız ve eksik koşular aşağıda ayrı gösterilir.

## İncelenen mimari ve bulunan eksikler

Hono bootstrap/middleware, Prisma tenant sınırı, modüler servisler, ayrı worker,
transaction içindeki audit/outbox, Redis readiness, Next App Router, Faz 7 release
altyapısı, Faz 8.2 kaynak bütçesi ve Faz 9 pgBackRest/PITR raporları incelendi.
Mevcut yönetim snapshot'ları ve provider gözlemleri vardı; çoklu replica üzerinde
toplanabilir histogram, gerçek log/trace backend'i, çalışan alarm teslim zinciri
ve bağımsız integrity taraması eksikti. Ağ probe'larının yalnız AbortSignal ile
sınırlandırılması gerçek PostgreSQL kesintisinde yeterli değildi.

## Uygulama ve dosyalar

| Sorumluluk | Dosyalar / değişiklik |
|---|---|
| Merkezi telemetry | `apps/backend/src/lib/telemetry/{context,tracing,exporter,metrics,log-exporter,error-fields,observed-fetch}.ts`: W3C bağlamı, sınırlı OTLP/JSON ve Loki gönderimi, güvenli alanlar |
| HTTP / DB | `bootstrap/http/{middleware,error-handlers}.ts`, `lib/{prisma,runtime-performance,serializable-transaction,logger,sensitive-redaction}.ts`: canonical route, süre/hata, güvenli JSON; SQL/bind/body kaydı yok |
| Readiness | `lib/probe-deadline.ts`, `bootstrap/operations/{readiness,runtime-health}.ts`: kesin uygulama deadline'ı ve her bağımlılıkta en fazla bir gerçek uçuş |
| Bağımsız SQL | `modules/platform/application/observability/{operational-probe,business-invariants,integrity-transitions,dr-metrics-file}.ts`: salt okunur bütünlük, neden bazlı diagnostic geçiş, kuyruk, quota ve DB/DR sinyalleri |
| Metrics erişimi | `modules/platform/http/controllers/metrics.controller.ts`, `middleware/globalRateLimit.ts`: her ortamda güçlü bearer; Redis arızası metrics'i gizleyemez |
| Outbox / worker | `domain-events/{events,event-codec,outbox}.ts`, `domain-events/delivery/dispatch.ts`, `services/domain-event-outbox-worker.service.ts`, `entrypoints/worker.ts`: kalıcı traceparent/correlation ve consumer span, ayrı worker metrics |
| Realtime | `modules/collaboration/chat/infrastructure/realtime/{delivery-telemetry,node-websocket-gateway,tenant-event-poller}.ts`, `packages/types/src/chat.ts`: istemci opt-in ACK, bounded takip, doğrulanamayan teslim ayrı sayaç |
| Provider / diagnostic güvenlik | shared observed-fetch facade, file-security, worker-loop, AI/Trendyol servisleri: raw provider hatası yerine güvenli hata sınıfı/kodu |
| Operasyon stack'i | `deploy/observability/`: digest ile sabitlenmiş Prometheus, Alertmanager, Tempo, Loki, Grafana; gerçek datasource ve sekiz dashboard |
| DR bağı | `deploy/dr/{Dockerfile,backup-loop.sh,metrics.sh,*observed.service.example,*metrics.service.example,*metrics.timer.example,README.md}`: gerçek backup sonucundan atomik durum, bağımsız read-only collector |
| Tekrarlanabilir kanıt | `scripts/observability/`: owned build, regression/integration, web quality, stack, incident, trace graph ve exporter outage araçları; `scripts/performance/local.ts`: telemetry kapalı/açık karşılaştırması |
| Müdahale | `docs/operations-runbooks.md`: her alarm için anlam, sorgu, güvenli recovery, escalation, iletişim ve postmortem |

Tam dosya listesi `artifacts/phase10-changed-files.json` içindedir. Mevcut
privacy/export/key yönetimi ve web düzeltmelerinin gerekçeleri ayrı 10.1/10.2
raporlarında yer alır; dashboard'lar uygulama UI'ına kopyalanmadı.

Finans/stock hesaplama kuralları, tenant yetkilendirmesi, zorunlu audit ve outbox
commit garantileri korunur. Monitoring transaction'a dış ağ çağrısı eklemez.
Faz 8.2 upload lock sırası ve 409 çözümü değiştirilmedi. Şema migration'ı yoktur.

## Sınırlar, erişim ve ölçüm anlamı

- Histogramlar saniye cinsinden, cumulative ve replica üzerinde toplanabilirdir.
  Label'lar canonical route/method/status, model/action ve sabit bağımlılıklar ile
  sınırlıdır. Tenant/user/request/object ID label yapılmaz. Aile ve seri sayıları
  bounded; limit aşımı ölçülür.
- Trace örnekleme varsayılanı %10; correctness tatbikatı %100 kullanır. OTLP
  kuyruğu 2048 span, batch 128, tek uçuş, 1 saniye ağ deadline'ı; sınırsız retry
  yoktur. Loki kuyruğu 512, batch 64, satır 16 KiB, tek uçuş/1 saniye; drop'lar
  ayrı ölçülür. Domain audit bu diagnostic kayıp politikasına tabi değildir.
- Production logları JSON'dur. Secret/PII/body/finansal içerik redaction'ı,
  kontrol karakterleri, alan/derinlik/satır sınırları uygulanır. Trace attribute
  allowlist'i SQL, prompt, dosya ve identity içeriğini dışarıda tutar.
- `/metrics` yapılandırılmadığında veya bearer 32 karakterden kısaysa 401;
  kapalıysa 404. Token URL, log veya label'a yazılmaz. Private monitoring ağları,
  servis başına config mount'ları ve read-only/cap-drop uygulanır. Grafana yalnız
  loopback yönetim portu, parola ve kapalı anonymous/signup ile açılır.
- DB süreleri Prisma round-trip, pool bekleme ve sorgu süresinin birleşimidir.
  Inflight gauge gerçek işlemleri sayar; native Prisma engine pool occupancy ya
  da saf pool wait histogram'ı olduğu iddia edilmez. `pg_stat_activity`, lock
  waiter, deadlock, transaction yaşı ve pool timeout ayrı gerçek sinyallerdir.
  Mevcut Prisma 6.19.3 üzerinde deprecated metrics preview'ı açılmadı; saf native
  pool occupancy/wait için ayrı driver değerlendirmesi açık teknik kapıdır.
  [Prisma'nın metrics belgesi](https://www.prisma.io/docs/orm/v6/prisma-client/observability-and-logging/metrics)
  bu preview'ın kullanımdan kaldırılmasını ve driver ölçümlerine geçişi açıklar.
- SQL taraması read-only RepeatableRead, statement 2 s / lock 100 ms /
  transaction 3 s / maxWait 1 s; cache 30 s ve tek uçuş. Timeout/eksik veri
  **unknown/failure** olur; sahte sağlıklı sıfır üretilmez. Platform audit taraması
  5000 satır budget'ını aşarsa unknown alarmı gerekir; daha büyük staging veri
  hacmi için checkpoint tabanlı doğrulama tasarımı ayrıca değerlendirilmelidir.
- ACK gecikmesi event oluşumundan istemcinin ACK dönüşüne kadardır; tek yönlü ağ
  gecikmesi değildir. Legacy istemcinin ACK vermemesi teslim kanıtı sayılmaz.
  Reconnect sayacı istemci bildirimi, heartbeat sayacı gateway tarafından görülen
  kapanış sinyalidir; bütün internet kopmalarının eksiksiz sayımı değildir.
- Storage mismatch, DB metadata toplamı ile kota muhasebesini karşılaştırır.
  Provider'daki her object'in içerik/key envanterinin sürekli doğrulaması değildir.
- Prometheus retention 7 gün/1 GB, Loki 7 gün, Tempo 72 saat; Docker diagnostic
  logları 10 MB × 3 dosya. Bunlar operasyon varsayılanlarıdır; duvar saati boyunca
  TTL süresi beklenip fiziksel silme doğrulanmadı ve hukuki onay yerine geçmez.

## Doğrulama kaydı

Tam workspace typecheck ve production modundaki yerel API/migrator/web/DR image
build'leri geçti. Birim testleri
236 backend + 84 web + 119 mobile = **439 PASS**. Guards PASS, release araçları
ilk koşuda 18/18, son output-reader regresyonlarıyla **21/21**; DR safety 10/10 PASS. Gerçek owned PostgreSQL üzerinde
`axon-dr-5021c933d74f`: **139/139 cross-module PASS**, atlanan test yoktur.
Son SQL tarama ve süreçler arası trace düzeltmelerini içeren
`axon-dr-e2d77f956275`: **143/143 PASS**, skip=0 ve owned cleanup tamamlandı.
Transaction saati yarışı düzeltmesinden sonra `axon-dr-32589eb3b6fc`:
**144/144 PASS**, skip=0 ve owned cleanup tamamlandı. En son backend tip ve
unit doğrulamaları `artifacts/phase10-age-fixed-{types,unit}.log` içindedir.
`artifacts/phase10-final-{typecheck,unit,guards,lint,release,dr-safety}.log`
son statik/birim/güvenlik kanıtlarını içerir; lint 0 hata ve önceden var olan
10 uyarıyla tamamlandı. Performans araçları son bounded-recorder sürümünde **19/19 PASS**.
`artifacts/phase10-source-review.json`: değişen/yeni 151 TypeScript dosyasında
yeni `any`, TS suppression ve kullanılmayan import/local/parameter **0**.
Output-reader sonrasında script tip/unused kontrolü tekrarlandı; değişmeyen
backend/web'in önceki tam 146 dosyalık kanıtı
`artifacts/phase10-before-output-fix-source-review.json` ile birlikte değerlendirilir.
`axon-dr-df765c3710da`: foundation/finance/operations entegrasyonları gerçek
PostgreSQL ve Redis ile PASS; yalnız canonical plan kataloğu hazırlanmıştır.

Önceki başarısız koşular artifact'larıyla korunur: yoğun paralel image build
sırasında 75/100 upload pool deadline'ı; shared types yeniden üretimiyle çakışan
unit import hataları; eksik plan kataloğu olan ilk owned integration koşusu.
Son başarılı koşular bu önkoşullar düzeltilerek çalıştırıldı. Eşikler artırılmadı.
İlk WAL fault injection, command-line archive_command'u ALTER SYSTEM ile
değiştiremediğinden geçersizdi; bu koşu WAL gecikmesi kanıtı sayılmaz.

## Gerçek incident matrisi

Her satır gerçek sentetik servis arızası, teslim edilmiş alarm, ilgili telemetry
ve güvenli toparlanma ile doğrulandı. Kaynaklar ayrı rastgele owned Docker
projeleridir; production/customer DB kullanılmadı.

| Olay | Kanıt / sonuç |
|---|---|
| API replica crash | `axon-dr-7ace8ac6354a`: gerçek SIGKILL, ApiReplicaDown firing/resolved, authenticated read recovery PASS |
| PostgreSQL kesintisi | Aynı owner: pause/unpause, kesin probe deadline'ı, bağımsız alarm ve recovery PASS |
| Redis kesintisi | Aynı owner: gerçek pause, readiness/metric/log/trace ve alarm/recovery PASS |
| Worker crash | Aynı owner: gerçek kill/start, heartbeat alarmı ve ERP recovery PASS |
| Dead-letter | Aynı owner: gerçek invoice intent'i, owned fixture quarantine, yetkili replay ve gerçek worker PROCESSED; HTTP→outbox parent graph PASS |
| Provider 429/500/timeout | Aynı owner: TLS fixture'da üç gerçek HTTP/timeout durumu; ERROR provider spans, alarm ve tam 5 dakikalık resolution penceresi PASS |
| WebSocket kesintisi | Aynı owner: gerçek mesaj/istemci ACK, transport close, alarm/log/trace ve resolution PASS |
| Storage kesintisi | Aynı owner: gerçek provider pause, readiness503 ve recovery; kota gevşetilmedi PASS |
| Backup failure | Aynı owner: yalnız owned repository erişim reddi, gerçek scheduler failure state, yeni başarılı backup ve resolved alarm PASS |
| WAL gecikmesi | Aynı owner: gerçek repo reddi/archive failure; SQL ile **901,492607 s**, eşik 900 s ve saat değişmedi; teslim/resolution PASS |
| Business invariant | Son `axon-dr-a38bc5eb8fb6`: committed sentetik negatif stok; bağımsız SQL + ilişkili log/complete trace + restore/alarm resolution PASS |
| Audit integrity | Son owner: bozuk yeni entry, append-only trigger'lar açık; alarm/log/complete trace; yeni hedef PITR ve 12 business/audit tablosunda eşleşen SHA-256 PASS |

Son `axon-dr-a38bc5eb8fb6/phase10-operations.json`: **PASS**, `incidentScope=integrity-recovery`,
cleanupFailures=0. Tüm 12 olay son düzeltmelerden sonra tek bir tam koşuda tekrar
edilmedi: 1–10'un değişmeyen yolları önceki tam koşuda, integrity/recovery yolları
hedefli regresyonda doğrulandı. Eski tam koşunun aggregate FAIL kaydı korunur.
Her owner altındaki `evidence-*.json`, `phase10-notifications.json`, recovery ve
runtime dosyaları hangi olayın hangi koşuda kanıtlandığını gösterir.

`axon-dr-32589eb3b6fc/cross-module/phase10-mail-trace.json`, gerçek Hono mail
enqueue → transaction/DB → kalıcı mail outbox → ayrı worker process → yerel
provider HTTP zincirinde tek trace, tek root, 23 span, bütün parent ID'leri ve
sensitive içerik yokluğunu doğrular. Tam 144 testlik koşu içindeki governance
dosyası 17/17 PASS'tir.

Son integrity owner'ında ayrıca gerçek Tempo ve Loki pause edildi. Export hata
sayaçları arttı, ödeme başarılı oldu ve aynı idempotency key'in replay'i aynı
payment ID'yi döndürdü; backend'ler açılınca trace/log yeniden alındı. Bu beklenen
diagnostic kayıp, domain audit kaybı olarak değerlendirilmez.

Sekiz dashboard'un **bütün PromQL panel sorguları** gerçek Prometheus'ta başarılı;
her dashboard en az bir gerçek seri içerir. Aktivitesi olmayan histogramlarda
No Data gizlenmez. Düşük yük son snapshot'ında 572 dosya, 51954891 mantıksal byte,
53264384 allocated file byte ölçüldü; bu 30 dakikalık yük maliyeti değildir.

## Son incelemede bulunan ve düzeltilen iki sorun

1. Diagnostic integrity durumu tek boolean ile coalesce ediliyordu. Stok
   ihlalinden audit ihlaline, arada sağlıklı API taraması olmadan geçilirse ikinci
   kritik neden log üretmiyordu. `axon-dr-7ace8ac6354a` audit alarmını gördü fakat
   yeni audit log/trace korelasyonu bulunamadığından **FAIL** oldu. Artık sabit,
   allowlist edilmiş nedenlerin signature'ı izlenir; aynı neden/count değişimi
   spam üretmez, farklı neden ayrı log üretir. Üç unit ve gerçek ardışık
   stock→audit/PITR tatbikatı PASS. Alarm eşikleri ve finans/audit kayıtları değişmedi.
2. Monitoring volume metadata helper'ı, farklı UID'nin 0700 dizinini cap-drop
   altında okuyamıyordu. `axon-dr-237cbcd884ce` bütün integrity/PITR/exporter
   senaryolarını geçti, disk ölçümünde **FAIL** oldu. Controlled volume testinde
   eski yöntem EACCES verdi; yalnız read/search capability ve read-only owned
   mount'larla yeni yöntem doğru 4096 byte ölçtü. Son gerçek stack ölçümü de PASS.
   API/worker/monitoring servislerinin capability'leri genişletilmedi. Helper hata
   çıktısı artık metadata-only artifact'a yazılır.

## Ölçülen kaynak ve latency maliyeti

Son karşılaştırma owner'ları: legacy-off `axon-perf-c63a37a9`, candidate-off
`axon-perf-da485702`, candidate-on `axon-perf-6a818220`. Legacy backend image
`sha256:e1acad790d97ecfa6756050e655389213cc9298db79257b901ffed9dd13f1385`, son
candidate `sha256:2424b8c384f78a187e34876c8c7bfedaff6b146bff2dbbf1ee87e3f9812af684`.
API/worker aynı candidate imajını kullanır. Diğer imajlar ve bütün budget değerleri
her owner'ın `environment.json` dosyasındadır; CLI imajları SHA ile dondurur.

Üç temiz koşu, aynı 150 sentetik tenant / 750 actor ve 25 VU mixed / 90 ölçülen
saniyedir. Dört API × 2 CPU/1 GiB/pool5, worker 2 CPU/1 GiB/pool5/250 ms,
PostgreSQL 2 CPU/1 GiB, Redis/provider 0,5 CPU/256 MiB, proxy 0,5 CPU/256 MiB,
web 1 CPU/768 MiB ve generator 2 CPU/1536 MiB korunur. Host 12 logical CPU ve
7,68 GiB Docker RAM'dir. Monitoring ayrıca ölçülür; uygulama limitleri artırılmadı.

| 25 VU ölçümü | Legacy / off | Candidate / off | Candidate / on |
|---|---:|---:|---:|
| Gerçek req/s | 35,0667 | 35,1333 | 35,1000 |
| Aynı `attachment.download` p95 / p99, ms | 37 / 40 | 33 / 53 | 32 / 46 |
| Aynı `invoice.approve` p95 / p99, ms | 125 / 159 | 106 / 138 | 115 / 136 |
| Upload p95 / p99, ms | 85 / 95 | 80 / 107 | 79 / 90 |
| Uygulama CPU ortalama / tepe, çekirdek | 0,90384 / 1,6652 | 0,92732 / 1,7446 | 1,04706 / 1,7634 |
| Uygulama RAM ortalama / tepe, MiB | 791,95 / 810,47 | 769,18 / 794,73 | 770,81 / 800,13 |
| Monitoring CPU ortalama / tepe, çekirdek | — | — | 0,0365 / 0,0480 |
| Monitoring RAM ortalama / tepe, MiB | — | — | 293,20 / 311,10 |

Off modda local instrumentation kalır. Legacy→candidate-off farkı yalnız tracing
SDK maliyeti olarak yorumlanamaz: toplam runtime/local instrumentation farkıdır
(bu örnekte uygulama CPU +%2,60). Candidate-off→on uygulama CPU farkı +%12,91
(+0,11975 çekirdek); ayrı monitoring CPU'su +0,0365 çekirdektir. App+monitoring
RAM farkı yaklaşık +294,82 MiB'dir. Sampling=0,1; gerçek log ve trace gönderimi
aktiftir. Monitoring sütunu beş backend/Grafana servisi ve yerel test sink'ini
kapsar; generator, image/init/tools süreçleri uygulama toplamına dahil değildir.

Kaynak ortalamaları 10 saniyelik Docker örneklerinin aritmetik ortalamasıdır;
kademe örnekleri ramp/warmup ve son kontrolleri de içerir. Latency yalnız ölçülen
90 saniyedir. Her konfigürasyon N=1 kısa karşılaştırmadır; istatistiksel olarak
genellenmiş overhead yüzdesi, maksimum throughput testi veya production bütçesi
değildir. Tam owner verisi `resources.json`, sayısal özet
`artifacts/phase10-performance-verified-summary.json` içindedir.

Tamamlanmış generator verisi ile tamamlanmış uçtan uca kabul birbirinden ayrılır.
Bu çalışmadan kabul edilmiş güvenilir kapasite sonucu çıkarılmaz.

`axon-perf-6a818220` generator'ı 1800 saniyeyi ve SLO'ları geçti; ancak browser
probe'undan sonraki kapanış örneği komut okuyucusunun 1.000.000 karakterlik tail
sınırında JSON başını kaybetti. Son provider/DB uzlaşması ve disk kanıtı
tamamlanmadığından CLI **exit=1 / FAIL** kaydı korunur. Bu owner'dan güvenilir
uzun kapasite sonucu üretilmez; yukarıdaki kısa kademe/cost ölçümleri ayrı ayrı
tam ve geçerli kısa sonuçlardır.

Kontrollü 1.100.000 karakterlik geçerli JSON ile eski okuyucu **18 PASS / 1 FAIL**
sonucu verdi (`artifacts/phase10-output-truncation-reproduction.log`). Diagnostic
logların varsayılan tail davranışı korunur. Structured measurement çağrıları
2.000.000 karakterle sınırlıdır; taşma durumunda kesilmiş JSON döndürmek yerine
sabit ve içeriği ifşa etmeyen hata verir. UTF-8 stream decoding de doğrulanır.
Yeni **21/21** release testi, **17/17** performans aracı ve script type/unused
kontrolleri PASS'tir. API/worker image SHA'sı ve uygulama bütçesi değişmedi.
Ara tekrar owner'ı `axon-perf-5aec629a` aşağıda ayrıca değerlendirilir;
bu koşudan da kabul edilmiş kapasite sonucu çıkarılmaz.

`axon-perf-5aec629a` tekrarında queue oldest age **49,010659 s > 30 s** oldu;
koşu durduruldu ve **FAIL / exit=2** kaydı korundu. Bu yeni owner 30 dakikalık
kapasite kanıtı değildir. Kapanışta bağımsız SQL ve provider/DB uzlaşması geçti;
2M structured reader aynı akışın **1.034.845 byte** JSON'unu eksiksiz okuyabildi.
Bu, önceki 1M tail sınırının gerçek akış için yetersiz olduğunu da doğrular.

Kaydedici ayrıca tam histogram metinlerini her 10 saniyede büyüyen snapshot
dizisinin içinde yeniden yazıyordu. Son dosya **138.063.313 byte**; ardışık
serialize edilmiş prefix'lerin toplamı yaklaşık **10.923.328.801 byte**'tır
(`phase10-observer-io.json`). Bu gereksiz observer maliyetidir; tek başına kuyruk
FAIL'inin kesin nedeni olduğu iddia edilmez. Aynı kayıtların scalar projection'ı
**10.036.926 byte** oldu; queue verisi ve telemetry sağlık sonucu bire bir aynı
kaldı (`artifacts/phase10-history-projection-proof.json`). Başarısızlık filtrelenmedi.

Kaynak geçmişi artık health/error/drop/pool/process/queue/quota/invariant
scalar'larını tutar. Tam metin `metrics-<phase>.json` dosyasında kademe başına
güncellenir; histogramlar gerçek Prometheus'ta toplanmaya devam eder. Generator
latency/receipt ölçümü, SQL ve queue eşikleri değişmedi. Recorder değişikliği için
**19/19** araç testi ve script type/unused kontrolleri PASS. Son yeni doğrulama
owner'ı `axon-perf-b3592558`; kullanıcı bu ölçümü durdurup mevcut sonuçların
raporlanmasını istedi. Yeni yük testi başlatılmadı.

Önceki `axon-perf-5aec629a`: telemetry açık mixed keşif, her kademede
90 ölçülen saniye:

| VU | req/s | En yüksek read p95, ms | En yüksek write p95, ms | WS doğrulanan / beklenen | WS p95, ms | Sonuç |
|---|---:|---:|---:|---:|---:|---|
| 25 | 35,0889 | 34 | 122 | 129 / 129 | 1005 | PASS |
| 50 | 70,0222 | 43 | 143 | 261 / 261 | 1043 | PASS |
| 75 | 104,2667 | 47 | 164 | 387 / 387 | 1024 | PASS |
| 100 | 136,7444 | 86 | 288 | 510 / 510 | 1034 | PASS — kısa keşif |

Her satırda measurementValid, bütün read/write/realtime SLO'ları, queueHealthy,
integrityHealthy ve telemetryHealthy=true; kayıp/taşan WS takibi, isolation
ihlali ve senaryo başarısızlığı sıfırdır. Read/write p95 sütunları endpoint
quantile'larının en yükseğidir; quantile'lar toplanıp sahte global quantile
üretilmedi. Bu tablo 100 VU için 30 dakika kapasite kanıtı değildir.

### İlk uzun koşuda bulunan operasyon taraması darboğazı

`axon-perf-f53aee4c` kısa 25/50/75 VU kademelerini geçti; 100 VU'da read
p95=325 ms olduğundan bu kademe FAIL'dir. 75 VU soak sırasında iş geçmişi
büyüdükçe API ve worker bağımsız taramaları `P2028` verdi. Ölçüm durduruldu;
`artifacts/phase10-soak-probe-failure.json` ve tamamlanmamış soak sonucu korunur.
Bu koşu 30 dakika kapasitesi veya sağlıklı monitoring kanıtı değildir.

Salt okunur `EXPLAIN`, 4469 tahmini invoice satırı için her invoice başına
`payment_allocations` sequential scan yapan correlated subplan gösterdi. Tahmini
toplam plan maliyeti 769456,40'tı. Invoice ID tek başına mevcut tenant+invoice
index'inin öneki değildir. Toplamayı bir kez yapıp LEFT JOIN ile eşleştiren
eşdeğer sorgunun tahmini maliyeti 541,62'dir. Bunlar süre değil PostgreSQL plan
maliyetleridir; kanıt `artifacts/phase10-operational-probe-plan-before-after.json`.
Rezervasyon toplamı da tenant başına yeniden tarama yerine bir kez gruplanır.
Domain yazma, ödeme/stok kuralları, audit ve outbox protokolleri değişmedi.
Sıfır allocation için COALESCE ve bütün tenant'ları kontrol etme anlamı korunur.

Statement=2 s, transaction=3 s ve pool wait=1 s sınırları artırılmadı. Yeni
regresyon 6000 invoice/allocation üzerinde sağlıklı taramayı, birden fazla
allocation'ın tek overpaid invoice sayılmasını, allocation'sız negatif total'ı
ve yalnız aktif rezervasyonların toplamını doğrular. Yük harness'i ayrıca her
ölçülen kademede dört API **ve worker** için probe=1 ve exporter failure/drop=0
zorunluluğu getirir; eksik veya bilinmeyen örnek PASS üretemez.

`axon-dr-e2d77f956275` bu regresyonda 6001 invoice/6001 allocation'a kadar
ulaştı: sağlıklı tarama **56,4044 ms**, gerçek ihlal taraması **46,3474 ms**.
Bu invoice geçmişidir; ayrı platform audit zincirinin 5000 satırlık doğrulama
budget'ını kaldırmaz veya büyük audit geçmişinde checkpoint ihtiyacını çözmez.

### Eşzamanlı commit / transaction saati yarışı ve kesilen tekrar koşusu

`axon-perf-237066c4` koşusunda 75 VU'nun HTTP/WS/SQL/kuyruk kontrolleri geçti,
ancak bir API'deki bağımsız probe başarısız olduğu için kademe **FAIL** sayıldı.
100 VU kısa kademe PASS oldu; uzun koşuda son kaydedilen kuyruk yaşı
**117,468868 s > 30 s** idi. Sonrasında host/Docker kesildi; 1800 saniyelik
tamamlanmış generator sonucu yoktur. Bu owner güvenilir kapasite kanıtı değildir.
`phase10-interrupted.json` kesintiyi, olumsuz sonucu ve owned cleanup'ı kaydeder.

`axon-dr-cd774ea363ee`: kontrollü yeni regresyon eski kodla **16 PASS / 1 FAIL**.
Salt okunur RepeatableRead transaction açılıp ilk data snapshot'ından önce başka
bağlantıdan gerçek outbox kaydı commit edildi. PostgreSQL `now()` transaction
başlangıcında sabit kalırken yeni kayıt snapshot'ta görüldü; negatif yaş
`axon_outbox_oldest_seconds` alanında Zod doğrulamasını düşürdü. Yapay saat,
gelecek tarih veya domain protokol değişikliği kullanılmadı. Bu mekanizma yükteki
geçici UnknownError için yeniden üretilen açıklamadır; eski hata logu doğrulama
alanını saklamadığından eski örneğin alanı doğrudan kanıtlanmış gibi sunulmaz.

Yalnız elapsed age SQL değerlerine sıfır alt sınırı eklendi. Negatif stok,
quota/accounting ve diğer invariant kontrolleri aynen kalır; 30 s kuyruk eşiği
artırılmadı. ZodError artık mesaj/body içermeyen sabit hata sınıfıyla raporlanır.
100 VU'nun sürdürülen kuyruk sınırı nedeniyle yeni doğrulama soak hedefi 75 VU'dur;
100 VU için başarılı uzun kapasite iddiası yoktur.

Son `axon-dr-32589eb3b6fc` koşusunda yeni yarış testi **PASS**; gerçek transaction
yaşı **−0,003365 s** iken kayıt sayısı korunup elapsed age=0 oldu. Aynı koşudaki
6001 invoice/allocation regresyonunda sağlıklı tarama **34,1133 ms**, ihlal
taraması **41,4696 ms** sürdü. Böylece iki bağımsız hata (quadratic tarama ve
transaction/snapshot saati yarışı) ayrı kanıt ve regresyonlarla ele alındı.

## Staging ve pilot kapıları

### Nihai mevcut sonuç ve karar

Son `axon-perf-b3592558` keşfi, her kademede 90 ölçülen saniye:

| VU | req/s | En yüksek read p95, ms | En yüksek write p95, ms | WS doğrulanan / beklenen | Sonuç |
|---|---:|---:|---:|---:|---|
| 25 | 34,3333 | 80 | 263 | 127 / 127 | PASS — kısa keşif |
| 50 | 66,5556 | 165 | 582 | 250 / 250 | PASS — kısa keşif |
| 75 | 94,8778 | 271 | **807** | 350 / 350 | **FAIL**, write sınırı 800 ms |
| 100 | 108,4556 | **825** | **1613** | 405 / 405 | **FAIL**, read/write/queue |

Bu kısa kademelerde measurementValid=true, telemetryHealthy=true; upload'ların
tamamı 201 (129/249/357/414), HTTP409=0, kayıp WS receipt=0'dır. Buna rağmen
gecikme veya queue ihlali olan kademe PASS sayılmaz. 75 VU'nun approve-replay
p95'i de 801 ms'dir. 75 VU soak tamamlanmadan kullanıcı tarafından durduruldu;
durdurma öncesi örneklenen queue age tepe **38,151539 s > 30 s** idi. Uzun koşu
upload/WS quantile'ları eksik olduğundan sıfır veya başarılı değerle doldurulmaz.

`axon-perf-6a818220` arşivinde gerçekten tamamlanmış 1800 saniyelik generator
verisi vardır: 181021 HTTP, 100,5672 req/s; read p95'i en yüksek endpoint'in
p50/p95/p99'u 57/194/373 ms; write p95'i en yüksek endpoint'in quantile'ları
126/445/906 ms; 7485 upload201, upload409=0, upload p50/p95/p99=92/380/871 ms;
7431/7431 WS receipt, WS p95=1042 ms. **Bu tanısal kayıt kapasite kabulü değildir:**
aynı koşunun kapanış JSON hatası nedeniyle CLI exit1 olmuş, son provider/DB ve
disk doğrulaması tamamlanamamıştır. Başarılı generator sonucu genel FAIL'i silmez.

Son kesilen koşunun güvenli kapanışında 10 SQL invariant'ı sıfır, üç planın ortak
ERP/chat kota kontrolleri PASS; aktif rezervasyon=0, usage mismatch=0,
cleanup exhausted=0. Provider ve DB'de **2304 object / 2433024 byte** eşleşir.
Kuyruk drained (pending/processing/failed/dead-letter=0); önceki age ihlalleri
korunur. Kapanış state kaydında beklenen 16 servis vardır; restart/OOM yoktur.
Owned container/network/volume ve geçici private fixture dosyaları temizlendi;
geçici system-awake isteği serbest bırakıldı. Kullanıcının diğer uygulamaları
kapatılmadı veya değiştirilmedi.

Kapanışta monitoring named volume ölçümü **605 dosya, 95215764 mantıksal byte,
96624640 allocated file byte**'tır. Bu **kesilen koşunun** ölçümüdür; 30 dakika
disk maliyeti değildir. Image/overlay, Docker log dosyaları ve bütün host diski
bu toplama dahil değildir. N=1 kısa CPU/RAM tablosu da yalnız gözlemdir; host
CPU ayrıştırması kanıtlanmadığından yüzdeler kesin nedensel telemetry maliyeti
veya production bütçesi olarak genellenmez.

Windows'ta eşzamanlı Docker dışı CPU yükü gözlendi; bir harici uygulama yaklaşık
bir logical core, masaüstü/IDE süreçleri ek CPU kullanıyordu. Bu, karşılaştırma
koşullarının kontrollü olmadığını gösterir; bütün geçmiş FAIL'lerin tek nedeni
olduğu kanıtlanmadı. Yerel kaynak `artifacts/phase10-host-load-observation.json`.
Bu nedenle **test edilen güvenilir kapasite: belirlenemedi**. 25/50 VU kısa
PASS, 30 dakikalık sürdürülebilir kapasite yerine geçmez.

Nihai makine okunur durum `artifacts/phase10-final-evidence.json`:
`verifiedLocal75VU=false`, `testedReliableCapacity=null`,
`measurementStoppedByUser=true`. PowerShell'in ham manifest wrapper'ı orijinal
dosyada korunur; rapor için normalize edilmiş görünüm
`artifacts/phase10-reported-performance-manifest.json` içindedir. Başarısızlıklar
silinmedi, eşikler düşürülmedi, retry/queue veya application kaynak limiti artırılmadı.

Faz 10'un **FAIL** kararı performans kabulü ve açık operasyon kapılarına aittir;
439 unit, 144 cross-module, 21 release, 19 performance-tool ve 10 DR safety
kontrolleri PASS'tir. Kodun işlevsel testlerinin geçmesi performans kabulünü
otomatik geçirmez. Sonraki adım, host yükü kontrol edilen ayrı bir pencerede aynı
kriterlerle yeni keşif/soak ve staging'de tek bir tam 12-olay matrisidir.

Gerçek dış alarm alıcısı, escalation/on-call teslimi, off-host repository IAM,
ayrı host restore, gerçek storage/provider entegrasyonu ve production ağ/secret
dağıtımı bu yerel tatbikatın kapsamı dışındadır. `a.md` staging çıkış kriteri
yerel Docker sonucu ile tamamlanmış sayılamaz. ERP içine ikinci bir Grafana
kopyası eklenmedi; mevcut yetkili admin özetleri korunur. Operasyon erişimi
ayrı sistem operatörüne aittir; tenant adminine repository/restore yetkisi verilmez.

W3C trace biçimi [Trace Context](https://www.w3.org/TR/trace-context/), exporter
yanıtları [OTLP specification](https://opentelemetry.io/docs/specs/otlp/) ve
histogram toplama [Prometheus histogram practices](https://prometheus.io/docs/practices/histograms/)
ile uyumlu olarak uygulanır.
