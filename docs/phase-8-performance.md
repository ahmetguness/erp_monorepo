# Faz 8 — Performans, yük ve maliyet

Bu çalışma kullanıcı onayıyla izole yerel Docker ortamında yapılır. Sonuçlar production kapasitesi, aylık availability veya gerçek sağlayıcı gecikmesi iddiası taşımaz. `a.md` özel çalışma belgesidir ve gitignore kapsamındadır.

Ölçülen kapasite, 30 dakikalık soak, darboğaz ve maliyet sonuçları: [2026-11-17 yerel sonuç raporu](phase-8-local-results-2026-11-17.md).

## Kodun yerleşimi

| Konum | Sorumluluk |
|---|---|
| `packages/types/src/performance.ts` | Ortak yük kademeleri ve sentetik fixture sözleşmesi |
| `scripts/performance` | Ortamın yaşam döngüsü, tipli yük üreticisi, ölçümler ve maliyet raporu |
| `apps/backend/scripts/performance` | Geçici DB fixture, kota yarışı, SQL invariant ve telemetri |
| `apps/backend/src/lib/runtime-performance.ts` | Korumalı Prometheus exporter için süreç/pool/bağlantı sayaçları |
| `apps/web/src/features/chat/model/realtime-refresh.ts` | WebSocket olaylarında toplu query invalidation |
| `apps/backend/tests/cross-module/scenarios/performance-contention.test.ts` | Stok/ödeme eşzamanlılığı ve sohbet planı regresyonları |

HTTP gövdeleri `unknown` olarak ayrıştırılıp sınırda doğrulanır. İstek etiketleri sabittir; histogramlar sınırlı bellekte tutulur. Müşteri verisi veya gerçek kullanıcı credential'ı kullanılmaz.

## Çalıştırma

Docker Desktop Linux engine, Node 22+ ve kurulu npm workspace bağımlılıkları gerekir. Chromium kurulu değilse `npm --workspace=web exec -- playwright install chromium` çalıştırılır. Production image'ları mevcut Dockerfile'larla derlenir; canlı deployment yapılmaz.

```powershell
npm run performance:local
```

Varsayılan matrix dört profili (`read,write,realtime,mixed`) 25, 100, 500, 1750, 2500 VU ile çalıştırır. Her kademede 10 saniye ramp, 5 saniye warmup, 30 saniye ölçüm ve kullanıcı başına 1000 ms think time vardır. Sonrasında en yüksek başarılı mixed kademede 1800 saniye soak çalışır; başarılı kademe yoksa 25 VU seçilir.

Yük üreticisi closed-loop çalışır: VU yolculuğunu bitirip think time bekler. Sonuç sabit geliş oranlı open-loop kapasite ölçümü değildir. Pencere içinde başlayan isteklerin tamamlanma gecikmesi cooldown dahil kaydedilir.

```powershell
# Kısa fixture/harness doğrulaması; dayanıklılık kanıtı sayılmaz.
$env:PERF_PROFILES='read,write,realtime,mixed'
$env:PERF_STAGES='smoke'
$env:PERF_SECONDS='15'
$env:PERF_TENANT_GROUPS='2'
$env:PERF_SKIP_SOAK='true'
npm run performance:local
```

`PERF_RAMP_SECONDS`, `PERF_WARMUP_SECONDS`, `PERF_THINK_MS`, `PERF_SOAK_SECONDS`, `PERF_SOAK_STAGE`, `PERF_API_REPLICAS` (1–4) ve `PERF_PRICING_FILE` ayarlanabilir. Varsayılan 50 grup, üç plan ve tenant başına 5 aktör ile 150 tenant/750 kullanıcı/30.150 ürün oluşturulur. Yüksek kademelerde aynı kullanıcının birden fazla oturumu vardır; VU sayısı benzersiz kullanıcı sayısı değildir. Fixture grupları 1–100 aralığındadır. Gerçek sayılar `environment.json` içinde kaydedilir.

Faz 8.1 kapasite araştırması için `probe50` ve `probe75` kademeleri de seçilebilir; varsayılan matrix değişmez. Kontrollü bütçe deneyleri: `PERF_API_POOL` (2–15, varsayılan 5), `PERF_WORKER_CPU`, `PERF_WORKER_INTERVAL_MS`, `PERF_PROXY_CPU`, `PERF_PROXY_MEMORY_MIB`, `PERF_GENERATOR_CPU`, `PERF_GENERATOR_MEMORY_MIB`. Sınırlar `scripts/performance/budget.ts` içinde doğrulanır ve gerçek değerler sonuca yazılır. Bu ayarlar production varsayılanını değiştirmez.

`PERF_CPU_PROFILE=true` API ana-thread CPU profilini ve gruplanmış özetini saklar; native Prisma engine thread'lerini fonksiyon bazında ölçmez ve profiling maliyeti vardır. `PERF_DIAGNOSTICS=true` her kademe için pg_stat_statements/normalize SQL ve izole DB'de EXPLAIN/indeks kontrolü toplar. `PERF_ACCESS_PLAN=true` gerçek access snapshot SQL planını ekler. Karşılaştırma kollarında aynı profiling/diagnostic ayarlarını kullan.

`PERF_SKIP_BUILD=true` yalnız aynı kaynaklardan önceden oluşturulmuş image'ları kullanır. Kod değişince yeniden derle. Sıfır SHA taşıyan test image'ları gerçek release kimliği değildir. Çıkış kodu 2 en az bir SLO'nun sağlanmadığını gösterir; rapor korunur. Tenant/DB invariant ihlalinde koşu durur.

## İzolasyon ve kaynak bütçesi

Her koşu UUID ile ayrı network, PostgreSQL 17, Redis 7, API, worker, Next web, Caddy TLS proxy ve yerel sağlayıcı oluşturur. DB/Redis hosta açılmaz; proxy yalnız 127.0.0.1 üzerinde rastgele porttan erişilir. Ayrı correctness DB'si de yalnız loopback'e bağlanır. Credential/fixture dosyaları geçici dizindedir, sonuçlara token yazılmaz. Cleanup yalnız koşunun ownership etiketiyle oluşturduğu kaynakları kaldırır.

| Bileşen | CPU | Bellek | DB pool |
|---|---:|---:|---:|
| PostgreSQL | 2 | 1 GiB | max_connections=100 |
| API, replica başına | 2 | 1 GiB | 5 |
| Worker | 2 | 1 GiB | 5 |
| Web | 1 | 768 MiB | — |
| Yük üreticisi | 2 | 1536 MiB | — |
| Redis / proxy / provider, her biri | 0,5 | 256 MiB | — |
| DB tool | — | — | 2 |

Worker outbox interval'i bu fixture'da açıkça 250 ms seçilir; production varsayılanı 10 saniye korunur. Host boyutları/image kimlikleri `environment.json` içinde yer alır. Bütün bileşenler aynı Docker hostunu paylaşır; donanım ve limitler sonuçla birlikte değerlendirilmelidir.

Object storage ve malware tarama yerel fixture'dır; gerçek S3 imzası/tarayıcı performansı ölçülmez. E-belge `DEPLOYMENT_ENV=local`, açık `mock` adaptör ve mock mail kullanır. Staging/production mock yasağı korunur. Harici ücretli AI/API çağrısı yapılmaz.

## Akışlar ve kabul ölçütleri

- Read: ürün/cari listesi, gelir özeti ve executive dashboard.
- Write: sipariş, fatura/onay ve eşzamanlı replay, tahsilat/replay, stok çıkışı/replay, multipart yükleme/korumalı indirme, ekip sohbeti.
- Realtime: kalıcı WebSocket, mesaj gönderme/listeleme, ping/pong, tenant sınırı ve olay teslim gecikmesi. Mixed/soak profillerinin bir bölümü WebSocket açık tutar.
- Her 20 iterasyonda başka tenant'ın ürünüyle okuma/mutation reddi kontrol edilir. Beklenen 400/404 ayrı sayılır; 429 ve 5xx başarıya çevrilmez.
- Her kademeden sonra SQL ile negatif stok, fazla ödeme, duplicate idempotency/journal referansı, dengesiz journal, cross-tenant ilişkiler ve rezervasyon muhasebesi kontrol edilir.
- Üç planın her birinde 25 eşzamanlı ERP/chat rezervasyonu aynı 10 KiB kotayı paylaşır; limit aşımı ve release sonrası sıfır rezervasyon doğrulanır.

Read p95 <300 ms, write p95 <800 ms, 5xx/transport oranı <%0,5; tenant/finans/stok ihlali sıfır. Ayrıca workflow'larda beklenmedik hata olmaması aranır. Kuyrukta FAILED/DEAD_LETTER sıfır, en eski iş <=30 saniye olmalıdır. Realtime profilinde bütün bağlantılar açılmalı, kopma olmamalı, ölçüm sırasında mesaj/pong alınmalı ve teslim p95 <2000 ms olmalıdır. Soak ölçüm penceresi en az 1800 saniyedir.

İlk Faz 8 teslim histogramı yalnız ölçüm penceresinde alınan olayları kapsıyordu; geçmiş sonuçlarda bire bir teslim eşleştirmesi yoktur. Faz 8.1 harness'i ayrıca kabul edilen mesajın `clientMessageId` değerini odadaki bütün beklenen bağlı alıcılarla eşleştirir. Bağlantı kopması eksik alıcı kaydını silmez; bounded tracking taşması ve eksik teslim FAIL'dir. Mixed/soak profilleri de bağlantı, teslim p95 ve eksiksiz alıcı doğrulamasına tabidir. Ölçüm sonrası 5 saniye teslim grace'i HTTP ölçüm penceresini uzatmaz. Kademe sonu SQL invariant'ları ile kademe içindeki mevcut kuyruk örnekleri de PASS koşuludur.

Tam VU kohortu warmup sonunda hazır değilse veya yük üreticisi event loop p99 >=100 ms ise ölçüm geçersizdir. Ayrıca 10 saniyelik ilerleme aralarında monotonic/duvar saatine göre 20 saniyeyi aşan kesinti ölçümü geçersiz kılar; son aralık da kapanışta kontrol edilir. Host uykuya geçerse veya engine kapanırsa eksik soak süresi tamamlanmış sayılmaz. Generator crash/OOM ayrıca kaydedilir; kapasite sonucu sayılmaz. Stres başarısızlığını gizlemek için SLO gevşetilmez.

Chromium ile dört ardışık sayfanın paint/FCP, kaynak transferi, DOM boyutu, HTTP durum ve JavaScript hataları ölçülür. Bu, yük sonrasında alınan bir browser baseline'ıdır; eşzamanlı tarayıcı kapasitesi veya tam Core Web Vitals saha ölçümü değildir.

## Kanıt ve maliyet

Koşu dosyaları `artifacts/performance/axon-perf-<id>/` altında tutulur: `report.md`, `resources.md`, `results.json`, profil/kademe JSON ve logları, `quota.json`, `invariants.json`, `database.json`, `provider.json`, `browser.json`, `environment.json`, `resources.json`. Artifact'lar gitignore kapsamındadır; sonuç özeti aşağıya eklenir.

10 saniyelik örneklerde CPU/RAM, API heap/event-loop/pool sayaçları, WebSocket sayısı, PostgreSQL bağlantı/lock/deadlock/transaction yaşı, sorgu kimliği bazında süreler, kuyruk derinliği/tamamlanma p95 ve tenant tüketimi bulunur. Örnekleme kısa tepeleri kaçırabilir. Credential yayımlanmaz; isteğe bağlı diagnostics normalize sorgu metnini yalnız yerel ignored artifact'lara yazar. Faz 8.1'de ORM model çağrılarına ek olarak `$queryRaw`/`$executeRaw` da operation/pool-timeout sayacına dahildir. Eski model-only sayaçla toplam operation sayısı doğrudan kıyaslanmaz. Ayrı pool acquire wait histogramı yoktur; SQL execution süreleri pg_stat_statements üzerinden görülür.

`pricing.example.json` bir fiyat teklifi değildir. Aylık altyapı (PostgreSQL/compute dahil) eşit tenant payına bölünür. Depolama GiB/ay; yalnız gözlenen indirme GiB, AI milyon token ve harici çağrı maliyetleri ayrı hesaplanır. Gerçek fiyatlar `PERF_PRICING_FILE` ile verilir. Yerel AI/ücretli API tüketiminin sıfır olması canlı maliyetin sıfır olacağı anlamına gelmez. Kısa koşudan aylık trafik veya %99,5 aylık availability çıkarılmaz.

## Faz 8.2 upload kontrolü

`PERF_PROFILES=upload` ayrı multipart upload/korumalı download profili seçer. 25/50/75/100 için `PERF_STAGES=smoke,probe50,probe75,baseline` kullanılır; mixed iş akışları aynen korunur. Diagnostics açıkken bounded PostgreSQL hata/lock logları da kaydedilir. Storage step süreleri client/lock beklemesini içerir; saf SQL execution veya pool-wait histogramı değildir.

Yük sonunda `storage-reconciliation.json`, provider/metadata nesne sayısı ve byte toplamını, aktif rezervasyonları, used-byte uyuşmazlıklarını ve cleanup exhaustion durumunu kontrol eder. Eşleşmeme koşuyu başarısız yapar; sayısal mutabakat exact-key recovery testlerinin yerine geçmez. Faz 8.2 bulguları, gerçek koşu kimlikleri ve sınırlı kapasite kararı [upload concurrency raporunda](phase-8.2-upload-concurrency-results.md) bulunur.
