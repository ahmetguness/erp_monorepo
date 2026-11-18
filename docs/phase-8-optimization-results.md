# Faz 8.1 — Darboğaz analizi ve yeniden doğrulama

**Nihai Faz 8 durumu: FAIL.** Güvenli optimizasyonlar ve yeniden ölçümler tamamlandı; 75 VU/4 API ile kesintisiz 1800 sn soak'ta gecikme, realtime, kuyruk ve bütünlük koşulları geçti. Ancak 101 upload HTTP409 nedeniyle başarılı iş akışı koşulu geçmedi. 1750/2500 VU hedefleri de doğrulanmadı. Yeni kod için tüm kabul koşullarını geçen 30 dakikalık mixed kapasite henüz kanıtlanmış değildir; eski 25 VU soak bu sonucu değiştirmez. Faz 9'a performans kapısı geçmiş gibi ilerlemek **NO-GO**.

## Kapsam ve ölçüm yöntemi

Çalışma, `phase-8-performance.md`, `phase-8-local-results-2026-11-17.md`, yerel `a.md`, backend/web kaynakları ve `artifacts/performance/` kanıtları üzerinden yürütüldü. `a.md` gitignore kapsamında ve izlenmiyor. Production/staging veritabanına bağlanılmadı; müşteri verisi veya credential kullanılmadı. Commit, push veya deployment yapılmadı.

Bütün performans servisleri aynı Docker Desktop hostunda: 12 mantıksal CPU, yaklaşık 7,68 GiB RAM. PostgreSQL 17: 2 CPU/1 GiB, max_connections=100; API replica başına 2 CPU/1 GiB/pool=5; worker: 2 CPU/1 GiB/pool=5/250 ms interval; generator: 2 CPU/1536 MiB; Caddy: 0,5 CPU/256 MiB; web: 1 CPU/768 MiB. Redis ve yerel provider ayrı 0,5 CPU/256 MiB konteynerlerdir. Deneysel kaynak değişiklikleri ayrıca belirtilir. Kesin host RAM baytı, image kimlikleri ve gerçek bütçeler her koşunun `environment.json` dosyasındadır; sıfır SHA taşıyan yerel image'lar release değildir.

Fixture her yeni koşuda aynı boyutta üretilir: üç plan, 150 tenant, 750 kullanıcı, tenant başına 201 ürün. VU sayısı benzersiz kullanıcı sayısı değildir; 750 üzerindeki VU'lar aynı sentetik kullanıcıların ayrı oturumlarıdır. Kimlikler rastgele, veri şekli ve iş akışları aynıdır. Bu veri hacmi büyük bir production geçmişini temsil etmez.

Fixture, gerçek `createSecuritySession` yoluyla her aktöre session oluşturur ve JWT'de `sessionId` taşır. HTTP session doğrulama/touch maliyeti iş yüküne dahildir; performans için session kontrolü atlanmaz. Sentetik token'ların 48 saat süresi testin kendi süresinin dolmasını engeller; süresi dolmuş/revoke edilmiş token/session davranışları ayrı güvenlik testleriyle doğrulanır.

Yük **closed-loop**: her VU bir yolculuğu tamamlar, 1000 ms bekler. Doygunlukta sunulan istek oranı da düşer; ölçülen RPS sabit geliş oranlı open-loop kapasitesi değildir. Ayrı fiziksel generator/staging olmadığı için yüksek VU sonuçları üretim kapasitesine çevrilmez. API, SQL, proxy ve generator aynı CPU/bellek kaynaklarını paylaşır.

Read p95 <300 ms, write p95 <800 ms, 5xx/transport <%0,5, realtime teslim p95 <2000 ms eşikleri korunmuştur. 429 ve beklenmeyen HTTP yanıtları başarı sayılmaz. Her profil ayrı değerlendirilir. Ramp/warmup dışındaki ölçüm penceresinde başlayan isteklerin tamamlanma süresi kaydedilir. Kısa karşılaştırmalar 10 sn ramp +5 sn warmup +15 sn ölçümdür; soak kanıtı sayılmaz.

Generator geçerliliği: tüm VU kohortu ölçüm başında hazır, event-loop p99 <100 ms, monotonic/duvar saati ilerleme aralıkları <=20 sn. Crash/OOM veya eksik kohort geçerli kapasite kanıtı değildir. Kaynak örnekleme 10 saniyeliktir; kısa CPU/lock/kuyruk tepelerini kaçırabilir.

## Kanıtlanan bulgular ve düzeltmeler

| Bileşen / kaynak | Kanıt ve neden | Düzeltme / beklenen etki | Regresyon riski ve kontrol |
|---|---|---|---|
| `middleware/requireAuth.ts`, `lib/jwt-verification-key.ts` | `212b033a/api-0-cpu-summary.json`: `createPublicKey`, aktif ana-thread self sample'larının %4,73'ü. String HMAC anahtarı her JWT doğrulamasında tekrar yorumlanıyordu. | Anahtar bir kez `KeyObject` olarak hazırlanır. Mikro deneyde maliyet düşer; API'de anlamlı hızlanma tek başına doğrulanmadı. | HS256/384/512, yanlış/imzası süresi dolmuş token ve RS256 PEM testleri. Algoritma, tenant veya session kontrolü gevşetilmedi. |
| `identity/infrastructure/access-context.resolver.ts::resolveAccessContext`, `user-access-snapshot.query.ts` | `212b033a/read-baseline-sql.json`: membership ve ilişkileri için her biri 2707 kez çağrılan kısa SQL'ler; Prisma runtime ana-thread self sample'larında %38,81. Her SQL genelde 0,03–0,06 ms; sorun tek başına yavaş bir SQL değil, round-trip ve client işlemlerinin çokluğu. | Aynı kullanıcı/tenant için membership, rol/izinler, tenant, IP ayarları, süresi dolmamış override ve plan özellikleri tek parametreli SQL snapshot'ında. Cache yok; her istek güncel okur. 100 VU kısa read p95: 352 →55 ms. | SQL sonucu Zod ile doğrulanır. Aktif kullanıcı/üyelik, silinmiş tenant, rolün tenant'ı, override süresi ve mevcut async tenant sınırı korunur. Cross-module testleri dinamik değişiklikleri kontrol eder. API-key/service resolver kapsamı değiştirilmedi. |
| `chat/infrastructure/persistence/prisma-chat.repository.ts::{getUnreadCount,listConversations}`, `unread-messages.query.ts` | İzole gerçek PostgreSQL/Prisma kontrolü, 20 oda: toplam sayaç 21 SQL /67,37 ms; liste 32 SQL /59,33 ms (`phase81-unread-before.log`). Oda başına ayrı `count` N+1 üretiyordu. | Toplu sorgu sonrası toplam sayaç 1 SQL /16,68 ms, liste 13 SQL /47,12 ms (`phase81-cross-final.log`). Süreler tek örnektir; istatistiksel endpoint SLO'su veya kontrollü CPU hızlanması sayılmaz. Sorgu sayısı sınırı testle doğrulanır. | Sender, deletedAt, lastReadAt/clearedAt/visibleFrom, leftAt, archivedAt korunur. Bildirim NONE toplam rozette hariç, liste satırında önceki davranışla sayılır. Yabancı tenant ve ambient scope uyumsuzluğu test edilir. Ana yük profilleri sohbet listesini/rozeti çağırmadığından bunlara bu değişiklikten RPS kazancı atfedilmez. |
| `chat/infrastructure/realtime/{node-websocket-gateway,tenant-event-poller,prisma-realtime-reader}.ts` | `3af979d4/realtime-baseline-sql.json`: 100 bağlantıda 2525 outbox SELECT. Her bağlantının ayrı timer/query/serialization yapması bağlantı sayısıyla büyüyordu. | Replica başına tenant paylaşımı; tenant batch'i başına güncel yetki ve olay sorgusu, olay başına tek serialization. `ac9121b7` 100 VU lifecycle'ında 420 olay +420 güncel yetki SELECT'i. Süreler grace nedeniyle aynı değildir; bu sayılar steady-state sorgu oranı olarak sunulmaz. | Yetki cache'i yok: aktif tenant/kullanıcı/üyelik, session, token süresi, IP ve oda üyeliği batch'te yeniden kontrol edilir. İki gerçek Node gateway ve aynı gateway'de farklı tenant testi. Yetki iptali 1008, okuma hatası 1011, backpressure/kapasite aşımı 1013 ile kapanır. |
| `prisma/schema/chat.prisma`, `20261118003000_chat_realtime_polling_index` | Eski `(tenantId,conversationId,createdAt)` indeksi tenant/zaman sıralamasının ön eki değildir. `ac9121b7/explain-index-control.json`: geçici 50 bin olay/50 oda kontrolünde 3,814 →0,059 ms. Önceki küçük gerçek outbox sorgusu zaten yaklaşık 0,09 ms idi; ana darboğazın indeks olduğu iddia edilmez. | `(tenantId,createdAt,id)` indeksi yeni tenant/zaman taramasını ve kararlı cursor sırasını destekler. | Ek disk/yazma maliyeti vardır. `CONCURRENTLY`, mevcut transaction-scoped release kilidini beklerken wrapper migration'ı bekledi: `phase81-migration-concurrent-wait.txt`. Bu varyant bırakıldı; normal CREATE INDEX gerçek release wrapper ile boş izole DB'de doğrulandı. Büyük canlı outbox için planlı yazma duraklaması gerekir. |
| `scripts/release/deploy.ts::proxyConfig` | `ac9121b7/proxy-full.log`: upload sırasında upstream `connection reset by peer`, ardından `no upstreams available`; write/50 ölçümünde 583 başarısız HTTP. API/proxy running, OOMKilled=false. Caddy idle keepalive varsayılanı Node'un 5 sn sınırından uzundu. | API ve web upstream idle keepalive 2 sn. Bağlantı sıfırlanması + pasif health dışlamasıyla hatanın büyümesini azaltır. Yeniden deneme eklenmedi; mutation güvenliği/idempotency aynı. | Daha kısa idle süre bağlantı yeniden kurulumunu artırabilir; aynı kaynakta karşılaştırılır. Timeout uyumsuzluğu belgelenmiş mekanizmadır; her reset'in tek nedeni olduğu varsayılmaz. [Caddy resmî açıklaması](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). |

### Reddedilen deneme: session verisini access JSON'una eklemek

İlk access optimizasyonundan sonra `a7b7dea2/read-baseline-sql.json`, snapshot'a ek olarak 2897 `tenant_settings` session okuması gösterdi (ortalama 0,0347 ms; toplam 100,52 ms sunucu execution). Session registry/max-age/idle-timeout verisini aynı access JSON'una ekleyen bir aday denendi. Güncel veri ve kilit altında tekrar okuma korunmasına, ilgili 102 cross-module testinin geçmesine rağmen aday performans testinde reddedildi.

`76bf8949/read-baseline.json`: 100 VU read p95 482 ms /FAIL; önceki tam aynı boyutlu kısa keşifte `a7b7dea2` 48 ms /PASS. Ayrı session okuması kalksa da daha büyük JSON sorgusu bu deneyde kazanç sağlamadı. Kesin CPU nedeni izole edilmedi; sadece SQL sayısının düşmesinden hızlanma sonucu çıkarılmadı. Adayın kalan kademeleri durduruldu (`candidate-rejected.json`); eksik profiller sonuç sayılmaz. Adayın sözleşmesi, yardımcı dosyası ve auth değişiklikleri tamamen geri alındı. Nihai kodda access+yakın zamanda güncellenmiş session kontrolü iki güncel statement kullanır; son görülme gerektiğinde mevcut ek kilit/okuma/yazmalar devam eder. Son testler bu iki-statement sınırını, revoke/expiry sonrası 401'i ve yabancı tenant session reddini korur.

### Realtime sınırları ve doğrulama

Tenant poller'ında toplam 2 eşzamanlı DB okuma, 1000 tenant/10.000 bağlantı, tenant başına 4096 ve toplam 65.536 hatırlanan olay ID'si sınırı vardır. Sayfalar 500 olaydır; sıralama `(createdAt,id)` ile kararlıdır. Cursor tamamlanmış taramanın zamanından ilerler; scheduler/DB duraksaması doğrudan atlanan zaman aralığına dönüşmez. 10 saniyelik overlap geç commit'leri kapsar; normal chat transaction'ları timeout ile sınırlıdır. Örtüşme dışındaki sınırsız geçmiş/reconnect replay garantisi verilmez. Mesaj geçmişi kalıcı HTTP sorgusundan okunur.

Hatırlanan ID'ler zaman penceresi geçince temizlenir; son bağlantı kapanınca tenant state'i/timer temizlenir. 256 KiB socket buffer sınırı, sınırsız bellek büyütmek yerine bağlantıyı kapatır. Testler overlap, scheduler duraksaması, cursor, adil sınırlı eşzamanlılık, kapanışta pending query, yanlış tenant, yetki iptali ve backpressure davranışını kapsar.

Örtüşmeli okuma için ek yetki regresyonu da düzeltildi: alıcının üyelik `visibleFrom`/`clearedAt` sınırından eski içerik olayları teslim edilmez. `phase81-history-before.log` eski sorgunun geçmiş olay döndürdüğünü gösteren başarısız gerçek DB testidir. Nihai reader olay zamanını `greatest(visibleFrom,clearedAt)` ile sınırlar; mevcut oda/sync metadata bildirimleri bu tarih filtresine tabi değildir. Böylece transaction timestamp'i üyelik başlangıcından önce olan yeni üyelik bildirimleri de ulaşır. Bütün olay türlerinde güncel aktif üyelik kontrolü korunur. Önceki adayın `43c6d0af` matrix'i bu ek sınırı içermediğinden nihai image matrix'iyle birleştirilmez.

Yeni bağlantı bekleyen tenant okuması sırasında açıldığında global event deduplication'ın o bağlantıyı atlaması da düzeltildi. Eski derlenmiş poller ile kontrollü deney (`phase81-poller-join-before.json`) ilk alıcıya 1, yeni alıcıya 0 teslim gösterdi. Nihai dedup kaydı, olay başına yalnız incelenmiş en büyük connection ID'sini tutar. Sonraki güncel yetki batch'inde daha yeni bağlantıya teslim yapılır, eski alıcıya tekrar gönderilmez. Alıcı başına sınırsız event set'i veya authorization cache'i eklenmedi; deterministik test her alıcıya tam 1 teslimi doğrular.

`socketFailures`, error/close/bozuk frame olay sayacıdır; benzersiz başarısız bağlantı sayısı olarak yorumlanmaz. Gerçek bağlantı kohortu ayrıca `cohortReadyAtSteady` ve `maximumSockets` üzerinden değerlendirilir. Poller'ın kaynak üst sınırları bir 10.000 bağlantı kapasite garantisi değildir.

Eski Faz 8 histogramı yalnız alınan mesajları sayıyordu; eksiksiz teslim kanıtı değildi. Yeni harness, HTTP öncesi `clientMessageId` ile o odadaki bağlı VU'ları kaydeder, yalnız kabul edilmiş POST'ları sayar ve **her beklenen alıcıyı** doğrular. HTTP yanıtından önce gelen WS frame'i de eşleştirilir. POST reddi çıkarılır; bağlantı kopması eksik alıcıyı silmez. Tracking 10.000 mesaj/100.000 alıcı referansıyla sınırlıdır; overflow başarısızlıktır. Ölçümden sonra 5 sn teslim grace'i HTTP throughput penceresine eklenmez. Mixed/soak için de bağlantı, legacy+doğrulanmış teslim p95 ve eksiksiz alıcı koşulları ayrı SLO alanlarıdır.

Web tarafındaki `features/chat/model/realtime-refresh.ts` 100 ms sabit pencerede invalidation birleştirir, pong'u yok sayar ve unmount'ta timer'ı kapatır. Bu Faz 8 düzeltmesi korunmuştur. Unit testleri sürekli olay akışında starvation ve unmount sonrası refetch'i kontrol eder. Node WS yükü React render kapasitesi ölçümü değildir; post-load Chromium sayfa kontrolleri de eşzamanlı tarayıcı kapasitesi veya saha Web Vitals kanıtı değildir.

## SQL, CPU ve gözlemlenebilirlik sınırları

`pg_stat_statements` her kademe öncesi sıfırlanır. `*-sql.json` normalize sorgu metni/çağrı/süre/buffer/temp bilgilerini, `explain-access-snapshot.json` kullanılan gerçek parametreli access sorgusunun planını içerir. Diğer `explain-*.json` dosyaları sentetik parametreli temsili sorgulardır; bire bir bütün Prisma endpoint planları değildir. İndeks kullanım snapshot'ında sıfır tarama, bir indeksin uygulama genelinde gereksiz olduğunun kanıtı sayılmadı; mevcut indeks silinmedi.

CPU profilleri API Node ana thread'inin self sample'larıdır; idle/root/program çıkarılır, GC ve startup dahildir. Native Prisma engine thread CPU'su bu fonksiyonlara atfedilemez. Yüzdeler process CPU saniyesi değildir; daha çok iş tamamlandığında aynı yüzde mutlak maliyet düşmedi anlamına gelmez. PostgreSQL SQL süresi, API Prisma işlem süresi ve uçtan uca HTTP gecikmesi farklı ölçülerdir.

| CPU profili | Aktif self sample | Prisma runtime payı | GC payı | `createPublicKey` |
|---|---:|---:|---:|---|
| Başlangıç `212b033a` | 49975 | %38,81 | %10,60 | %4,73 |
| Hazır JWT anahtarı `e5ed5145` | 47977 | %40,87 | %11,31 | İlk 50 fonksiyonda yok |
| Access snapshot `3af979d4` | 51973 | %39,32 | %10,49 | İlk 50 fonksiyonda yok |
| Daha sonraki 16-keşif `a7b7dea2` | 159275 | %42,77 | %10,14 | İlk 50 fonksiyonda yok |

İlk üç profil dört adet 100 VU kısa yükü, son profil 16 kısa kademeyi kapsar; sample sayıları aynı süre/iş miktarı değildir. İlk 50'de olmamak sıfır CPU maliyeti demek değildir. Prisma yüzdesinin düşmemesi access read yolundaki HTTP kazanımını çürütmez; iş tamamlanma sayısı ve diğer CPU maliyetleri değişir. Final replica matrix ve soak'ta profiler kapatılarak ölçüme ek maliyet bindirilmedi; final image için profiler yüzdesi uydurulmadı.

Yeni `$queryRaw`/`$executeRaw` çağrıları da operation/pool-timeout sayaçlarına alınmıştır; ORM model çağrıları çift sayılmaz, hatalar aynı nesneyle yeniden fırlatılır. Önceki model-only sayacıyla mutlak operation sayısı doğrudan kıyaslanmaz. Pool acquire wait için ayrı bir histogram yoktur; bunu SQL execution veya toplam operation süresinden uydurmuyoruz. PG lock/transaction ve bağlantı örnekleriyle, gerçek pool timeout'ları ve kontrollü pool deneyi birlikte değerlendirilir.

Finans/stok transaction'ları, idempotency replay, audit, domain outbox ve tüketici receipt mekanizmaları korunur. Yazma senaryosu fatura/onay, ödeme/replay, stok/replay, sipariş, multipart upload/korumalı download ve chat akışlarını içerir. Genel bir transaction kapsamı daraltması yapılmadı. Yavaş yazmaları yalnız authorization'a veya eksik indekse bağlamak kanıtla desteklenmiyor.

Harness, kademe sonu SQL invariant sonucunu da PASS koşuluna bağlar. Kuyruk FAILED/DEAD_LETTER/yaş koşulu hem kademe sonu hem o kademe içindeki mevcut örnekler üzerinde aranır; sonradan boşalmış kuyruk önceki örnek ihlalini gizlemez. Loglar stdout+stderr birlikte, son 1000 satır/1 MB sınırıyla saklanır; bunlar sınırsız tam log arşivi değildir.

## Regresyon doğrulaması

- Unit: **406 PASS** — backend 215, web 72, mobile 119 (`artifacts/phase81-release-unit.log`).
- Gerçek PostgreSQL cross-module: **103 PASS /21 dosya** (`phase81-release-cross.log`). Stokta 25 tüketici, aynı ödemenin 25 replay'i, tenant sınırları, session revoke/touch yarışı, audit/outbox rollback, yeni realtime sınırları ve trial UTC/yazma son tarihi dahildir.
- Release araçları: **18 PASS** (`phase81-diagnostics-release.log`).
- Performans araçları: **15 PASS** (`phase81-diagnostics-tests.log`). Eksik alıcı, kabul öncesi teslim, bounded tracking overflow, kaynak sınırları, kuyruk hatası/yaşı, kesintili ölçüm ve başarısız alt komutun JSON kanıtını kaybetmeme davranışları dahildir.
- Backend API/worker ve migrator production image build'leri başarılı (`phase81-release-build.log`). Next.js 16.4.6 web production build'i başarılı (`phase81-web-build-final.log`); kullanıcının mevcut Next/package-lock değişiklikleri korunmuştur.
- Module boundary, Prisma architecture/schema, API contracts, tenant guard, security-hardening ve permission-gating kontrolleri başarılı (`phase81-release-guards.log`).
- Types/scripts/backend/web/mobile tip kontrolleri ve types-layout başarılı (`phase81-release-typecheck-*.log`). Son harness/metrik açıklaması değişikliği sonrası scripts ve backend tip kontrolleri tekrar geçti (`phase81-final-typecheck-{scripts,backend}.log`). 65 değişen TS/TSX dosyasında explicit `any` ve kullanılmayan bildirim bulunmadı (`phase81-source-audit.json`); kontrol bütün eski repository kodunun temiz olduğunu iddia etmez.
- Backend/web lint: 0 hata, 10 mevcut uyarı (`phase81-lint-final.log`); uyarılar temiz sonuç gibi sunulmaz.

Her performans koşusunda üç planın ortak ERP/chat kotası ayrıca 25 eşzamanlı rezervasyonla kontrol edilir. `raceAccepted` doğrudan yarışın kazanan sayısıdır; `accepted` ise gerekirse seri tamamlamadan sonraki sayıdır. Test 10 KiB toplam sınırı, her iki kaynaktan kabul, bir byte fazlasının reddi ve release sonrası sıfır rezervasyonu doğrular. `rejected`, kota reddi yanında sınırlı serialization retry sonrası ConflictError'ı da içerebilir; bu sayı yalnız kota nedeniyle ret gibi yorumlanmaz. Bunlar gerçek ücretli storage/AI sağlayıcısı kapasite testleri değildir.

## Aynı image ile 1/2/4 API replica matrisi

Nihai performans algoritmasıyla üç koşu: `79c197bb` (1 API), `04f232d7` (2 API), `1a5543a5` (4 API). Her biri dört profil ×100/500/1750/2500 VU; 20 sn ramp +10 sn warmup +30 sn ölçüm, profiling kapalı. Tablo üretimi üç koşunun API/migrator/web image kimliklerinin aynı olduğunu ve 48 kademe sonunda SQL invariant sonucunun PASS olduğunu ayrıca doğruladı.

Replica başına bütçe aynıdır; toplam API bütçesi sırasıyla 2/4/8 CPU ve 1/2/4 GiB olur. Diğer bileşenler sabittir. CPU limitleri üst sınırdır, ayrılmış/dedike CPU garantisi değildir. Sonradan aşırı yüklenmiş kuyruk bir sonraki profilin sonucunu da etkileyebilir; bu matris birikimli stres testidir. Bir profilin p95'inin geçmesi, kuyruk veya ölçüm geçerliliği başarısızsa PASS sayılmaz.

HTTP/sn bütün ölçülen yanıtları, beklenen sınır reddini ve hataları içerir; başarılı iş akışı/sn anlamına gelmez. `—`, ilgili istek türünün o ölçüm penceresinde örnek üretmediğini gösterir. Geçersiz satırlardaki yüzdelikler yalnız hata kanıtıdır, kapasite sonucu değildir.

| API | Profil | VU | HTTP/sn | Read p95 ms | Write p95 ms | 5xx/transport % | Beklenmeyen yanıt | Ölçüm | Kuyruk | Sonuç |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | read | 100 | 107.3 | 73 | — | 0.00 | 0 | geçerli | PASS | PASS |
| 1 | read | 500 | 138.3 | 4663 | — | 0.00 | 0 | geçerli | PASS | FAIL |
| 1 | read | 1750 | 365.6 | 15010 | — | 73.04 | 8014 | geçerli | PASS | FAIL |
| 1 | read | 2500 | 131.8 | 15763 | — | 98.00 | 3875 | GEÇERSİZ | PASS | FAIL |
| 1 | write | 100 | 51.1 | 2195 | 4093 | 0.00 | 1 | geçerli | PASS | FAIL |
| 1 | write | 500 | 51.3 | — | 15012 | 40.55 | 658 | geçerli | PASS | FAIL |
| 1 | write | 1750 | 181.8 | — | 17267 | 100.00 | 5453 | GEÇERSİZ | PASS | FAIL |
| 1 | write | 2500 | 144.6 | — | 26231 | 98.76 | 4285 | GEÇERSİZ | PASS | FAIL |
| 1 | realtime | 100 | 69.0 | 1036 | 1428 | 0.00 | 0 | GEÇERSİZ | PASS | FAIL |
| 1 | realtime | 500 | 71.8 | 6902 | 8551 | 0.00 | 0 | geçerli | PASS | FAIL |
| 1 | realtime | 1750 | 196.5 | 15014 | 15044 | 86.17 | 5080 | GEÇERSİZ | PASS | FAIL |
| 1 | realtime | 2500 | 102.8 | 14551 | 15001 | 10.99 | 340 | GEÇERSİZ | PASS | FAIL |
| 1 | mixed | 100 | 77.4 | 1316 | 2355 | 0.00 | 0 | geçerli | PASS | FAIL |
| 1 | mixed | 500 | 63.9 | 11178 | 15002 | 11.43 | 219 | geçerli | PASS | FAIL |
| 1 | mixed | 1750 | 281.2 | 16147 | 15958 | 78.94 | 6661 | GEÇERSİZ | PASS | FAIL |
| 1 | mixed | 2500 | 202.2 | 15127 | 15160 | 92.53 | 5618 | GEÇERSİZ | PASS | FAIL |
| 2 | read | 100 | 107.9 | 34 | — | 0.00 | 0 | geçerli | PASS | PASS |
| 2 | read | 500 | 262.8 | 2545 | — | 0.00 | 0 | geçerli | PASS | FAIL |
| 2 | read | 1750 | 476.3 | 14647 | — | 59.55 | 8510 | GEÇERSİZ | PASS | FAIL |
| 2 | read | 2500 | 223.5 | 15282 | — | 74.39 | 5082 | GEÇERSİZ | PASS | FAIL |
| 2 | write | 100 | 79.6 | 1233 | 2600 | 0.00 | 3 | geçerli | PASS | FAIL |
| 2 | write | 500 | 71.3 | 11597 | 15004 | 3.04 | 68 | geçerli | FAIL | FAIL |
| 2 | write | 1750 | 194.6 | — | 16458 | 99.95 | 5835 | GEÇERSİZ | FAIL | FAIL |
| 2 | write | 2500 | 218.8 | — | 17184 | 100.00 | 6564 | GEÇERSİZ | FAIL | FAIL |
| 2 | realtime | 100 | 104.2 | 107 | 190 | 0.00 | 0 | geçerli | FAIL | FAIL |
| 2 | realtime | 500 | 136.8 | 3438 | 4305 | 0.00 | 0 | geçerli | PASS | FAIL |
| 2 | realtime | 1750 | 148.4 | 13298 | 14063 | 13.19 | 587 | GEÇERSİZ | PASS | FAIL |
| 2 | realtime | 2500 | 73.0 | 15039 | 15022 | 21.10 | 464 | GEÇERSİZ | PASS | FAIL |
| 2 | mixed | 100 | 119.5 | 502 | 1398 | 0.00 | 2 | geçerli | PASS | FAIL |
| 2 | mixed | 500 | 106.9 | 7066 | 13752 | 0.03 | 1 | geçerli | PASS | FAIL |
| 2 | mixed | 1750 | 134.1 | 15312 | 15320 | 82.92 | 3340 | GEÇERSİZ | PASS | FAIL |
| 2 | mixed | 2500 | 162.8 | 17453 | 17452 | 75.18 | 3678 | GEÇERSİZ | PASS | FAIL |
| 4 | read | 100 | 108.0 | 34 | — | 0.00 | 0 | geçerli | PASS | PASS |
| 4 | read | 500 | 366.1 | 1155 | — | 0.00 | 0 | GEÇERSİZ | PASS | FAIL |
| 4 | read | 1750 | 348.3 | 11626 | — | 0.63 | 66 | GEÇERSİZ | PASS | FAIL |
| 4 | read | 2500 | 164.1 | 19991 | — | 59.00 | 2951 | GEÇERSİZ | PASS | FAIL |
| 4 | write | 100 | 100.1 | 936 | 2447 | 0.00 | 66 | geçerli | FAIL | FAIL |
| 4 | write | 500 | 99.7 | 7692 | 12484 | 0.10 | 45 | geçerli | FAIL | FAIL |
| 4 | write | 1750 | 232.2 | 17400 | 18940 | 99.21 | 6910 | GEÇERSİZ | FAIL | FAIL |
| 4 | write | 2500 | 200.4 | 15083 | 18531 | 98.52 | 5923 | GEÇERSİZ | FAIL | FAIL |
| 4 | realtime | 100 | 105.0 | 101 | 203 | 0.00 | 0 | geçerli | FAIL | FAIL |
| 4 | realtime | 500 | 149.9 | 4731 | 5787 | 0.00 | 0 | GEÇERSİZ | FAIL | FAIL |
| 4 | realtime | 1750 | 119.3 | 15001 | 11732 | 12.88 | 470 | GEÇERSİZ | FAIL | FAIL |
| 4 | realtime | 2500 | 91.3 | 14709 | 13329 | 2.04 | 99 | GEÇERSİZ | FAIL | FAIL |
| 4 | mixed | 100 | 134.7 | 128 | 371 | 0.00 | 0 | geçerli | FAIL | FAIL |
| 4 | mixed | 500 | 161.2 | 4934 | 8924 | 0.00 | 0 | geçerli | FAIL | FAIL |
| 4 | mixed | 1750 | 189.5 | 15060 | 15064 | 53.36 | 3079 | GEÇERSİZ | FAIL | FAIL |
| 4 | mixed | 2500 | 218.6 | 15188 | 15565 | 89.27 | 5867 | GEÇERSİZ | FAIL | FAIL |

## Replica altında realtime teslimi

Kohort, ölçüm başlamadan hazır VU sayısıdır; mixed profilinde bunların yalnız beşte biri WS açar. Teslim p95, kabul edilmiş mesajların eşleştirilen alımlarına aittir. 0/0 veya sıfır teslim örneği, realtime başarısı değildir. Eksik alım ve bağlantı hataları SLO'da ayrıca FAIL üretir.

| API | Profil | VU | Başlangıç kohortu | Doğrulanan/beklenen alım | Teslim p95 ms | Socket hata olayı |
|---:|---|---:|---:|---:|---:|---:|
| 1 | realtime | 100 | 91/100 | 1874/1874 | 3361 | 18 |
| 1 | realtime | 500 | 500/500 | 1895/1895 | 24990 | 0 |
| 1 | realtime | 1750 | 1186/1750 | 947/1604 | 11491 | 1034 |
| 1 | realtime | 2500 | 1103/2500 | 551/1097 | 5031 | 2562 |
| 1 | mixed | 100 | 100/100 | 94/94 | 2965 | 0 |
| 1 | mixed | 500 | 500/500 | 48/92 | 29707 | 0 |
| 1 | mixed | 1750 | 1676/1750 | 0/49 | 0 | 60 |
| 1 | mixed | 2500 | 2256/2500 | 65/65 | 5607 | 488 |
| 2 | realtime | 100 | 100/100 | 2840/2840 | 1033 | 0 |
| 2 | realtime | 500 | 500/500 | 3875/3875 | 25345 | 0 |
| 2 | realtime | 1750 | 1053/1750 | 4322/5009 | 27719 | 1394 |
| 2 | realtime | 2500 | 1004/2500 | 611/763 | 17391 | 2766 |
| 2 | mixed | 100 | 100/100 | 148/148 | 1049 | 0 |
| 2 | mixed | 500 | 500/500 | 144/146 | 25229 | 0 |
| 2 | mixed | 1750 | 1738/1750 | 36/36 | 17578 | 22 |
| 2 | mixed | 2500 | 2365/2500 | 35/39 | 7907 | 270 |
| 4 | realtime | 100 | 100/100 | 2865/2865 | 1050 | 0 |
| 4 | realtime | 500 | 500/500 | 4150/4150 | 24891 | 0 |
| 4 | realtime | 1750 | 959/1750 | 2953/2953 | 5382 | 1454 |
| 4 | realtime | 2500 | 960/2500 | 3219/3219 | 3722 | 2756 |
| 4 | mixed | 100 | 100/100 | 163/163 | 1045 | 0 |
| 4 | mixed | 500 | 500/500 | 234/234 | 13537 | 0 |
| 4 | mixed | 1750 | 1746/1750 | 232/267 | 3843 | 2 |
| 4 | mixed | 2500 | 2389/2500 | 16/16 | 3552 | 196 |

## JSON tarih sınırı düzeltmesi ve image izlenebilirliği

Access snapshot'ın `timestamp without time zone` alanı JSON'da ofsetsiz dönüyordu. İzole QA veritabanı ve İstanbul saat dilimindeki Node ile `12:34:56.123` değeri yanlışlıkla `09:34:56.123Z` olarak yorumlandı (`phase81-date-boundary-before.json`). `AT TIME ZONE 'UTC'` ile açık ofset eklendi; aynı deney doğru `12:34:56.123Z` sonucunu verdi (`phase81-date-boundary-after.json`). Yeni gerçek HTTP testi, gelecekteki trial'da yazmanın kabulünü ve son tarih geçince yazmanın reddini doğrular.

Replica matrisi karşılaştırmasının image'ı sabit tutuldu: `phase81-verified`. Bu son tarih düzeltmesi `phase81-release` test image'ına eklendi; sonraki kaynak deneyleri ve soak bu image'ı kullanır. Performans aktörlerinin tamamı ACTIVE ve trialEndsAt=NULL olduğundan bu düzeltme matrisin iş yükündeki bir trial dalını değiştirmez. İki image grubu, kaydedilmiş image kimlikleriyle ayrılır; tek bir release/production ölçümü gibi sunulmaz.

Son metrik incelemesinde Prometheus HELP açıklamasındaki eski “exclude raw SQL” ifadesi de “include … parameterized raw SQL” olarak düzeltildi. Sayaçların raw SQL'i ölçen davranışı zaten test image'larında mevcuttu; bu son değişiklik yalnız açıklama metnidir. Image'lardaki eski HELP satırı yeni sayaç kapsamına ilişkin bir davranış farkı olarak yorumlanmamalıdır.

## Önce/sonra kısa keşifler

Aşağıdaki koşuların kaynak bütçesi, fixture şekli ve 100 VU senaryoları aynıdır; 10 sn ramp, 5 sn warmup, 15 sn ölçüm kullanılmıştır. İlk üç koşu dört adet 100 VU profilidir; son iki koşu 25/50/75/100 keşiflerinin 100 VU satırlarıdır. Önceki kademelerden kalan veriler, aynı hostun anlık yükü, CPU profiling ve yeni teslim kanıtının 5 sn grace maliyeti bire bir izolasyonu sınırlar. Bu kısa tek tekrarlar güven aralığı veya her değişiklik için nedensel hızlanma garantisi değildir. Özellikle JWT tek başına anlamlı HTTP kazanımı sağlamadı; access snapshot read yolunda belirgin kazanım gösterdi. Mixed/write sorunları tek replica ile devam etti.

| Aday / kanıt | Profil /100 VU | RPS | Read p95 ms | Write p95 ms | Başarısız HTTP | Sonuç |
|---|---|---:|---:|---:|---:|---|
| Başlangıç / `212b033a` | read | 101.67 | 352 | 0 | 0 | FAIL |
| Başlangıç / `212b033a` | write | 42.47 | 2662 | 4378 | 0 | FAIL |
| Başlangıç / `212b033a` | realtime | 58.07 | 1004 | 1197 | 0 | FAIL |
| Başlangıç / `212b033a` | mixed | 61.00 | 1712 | 2814 | 0 | FAIL |
| JWT anahtarı / `e5ed5145` | read | 100.27 | 353 | 0 | 0 | FAIL |
| JWT anahtarı / `e5ed5145` | write | 43.60 | 2629 | 4436 | 0 | FAIL |
| JWT anahtarı / `e5ed5145` | realtime | 57.40 | 948 | 1174 | 0 | FAIL |
| JWT anahtarı / `e5ed5145` | mixed | 61.53 | 1669 | 2769 | 0 | FAIL |
| Access snapshot / `3af979d4` | read | 110.60 | 55 | 0 | 0 | PASS |
| Access snapshot / `3af979d4` | write | 51.33 | 2089 | 3567 | 0 | FAIL |
| Access snapshot / `3af979d4` | realtime | 78.00 | 540 | 672 | 0 | FAIL |
| Access snapshot / `3af979d4` | mixed | 76.33 | 1189 | 2048 | 0 | FAIL |
| Toplu realtime / `ac9121b7` | read | 109.80 | 69 | 0 | 0 | PASS |
| Toplu realtime / `ac9121b7` | write | 42.47 | 2316 | 4744 | 1 | FAIL |
| Toplu realtime / `ac9121b7` | realtime | 73.53 | 646 | 819 | 0 | FAIL |
| Toplu realtime / `ac9121b7` | mixed | 57.80 | 1775 | 3513 | 0 | FAIL |
| Keepalive + ölçüm düzeltmeleri / `a7b7dea2` | read | 110.47 | 48 | 0 | 0 | PASS |
| Keepalive + ölçüm düzeltmeleri / `a7b7dea2` | write | 51.80 | 1871 | 3477 | 1 | FAIL |
| Keepalive + ölçüm düzeltmeleri / `a7b7dea2` | realtime | 43.07 | 1595 | 2073 | 0 | FAIL |
| Keepalive + ölçüm düzeltmeleri / `a7b7dea2` | mixed | 28.67 | 4865 | 9264 | 0 | FAIL |


## Endpoint gecikmesi ve payload

Nihai sabit-image matrix'inde her profilin 100 VU kademesindeki en yüksek üç endpoint p95'i aşağıdadır. p50/p95/p99 endpoint histogramlarıdır; profil genelinde birleştirilmiş percentile değildir. Byte, harness'in aldığı response body toplamının istek sayısına bölümüdür; gzip wire boyutu veya upload request büyüklüğü değildir. Hatalı yanıtlar histogramdan çıkarılmadı. Aynı matrix'teki 4-replica mixed HTTP sonuçları iyi olsa da önceki ağır write yükünden kalan kuyruk yaşı nedeniyle kademe toplamda FAIL'dir.

| Replica /profil /100 VU | Endpoint | p50 /p95 /p99 ms | Ort. yanıt byte | Başarısız /toplam |
|---|---|---:|---:|---:|
| 1 /read | `/api/contacts` | 20 /73 /133 | 1027.0 | 0/733 |
| 1 /read | `/api/products` | 18 /55 /110 | 13670.0 | 0/732 |
| 1 /read | `/api/dashboard/basic/executive` | 20 /54 /115 | 472.0 | 0/730 |
| 1 /write | `attachment.upload` | 3331 /4093 /4489 | 523.2 | 1/141 |
| 1 /write | `order.create` | 2341 /2916 /3007 | 863.0 | 0/137 |
| 1 /write | `invoice.create` | 2331 /2833 /2947 | 1041.0 | 0/146 |
| 1 /mixed | `attachment.upload` | 1705 /2355 /2561 | 526.0 | 0/91 |
| 1 /mixed | `invoice.create` | 1201 /1741 /1866 | 1041.0 | 0/93 |
| 1 /mixed | `order.create` | 1205 /1689 /1861 | 863.0 | 0/95 |
| 2 /read | `/api/contacts` | 17 /34 /51 | 1027.0 | 0/738 |
| 2 /read | `/api/dashboard/basic/executive` | 19 /32 /48 | 472.0 | 0/734 |
| 2 /read | `/api/products` | 17 /31 /45 | 13670.0 | 0/737 |
| 2 /write | `attachment.upload` | 1936 /2600 /2855 | 520.4 | 3/210 |
| 2 /write | `invoice.create` | 1266 /1695 /1988 | 1041.0 | 0/210 |
| 2 /write | `order.create` | 1170 /1644 /1918 | 863.0 | 0/206 |
| 2 /mixed | `attachment.upload` | 447 /1398 /1690 | 520.8 | 2/149 |
| 2 /mixed | `invoice.create` | 217 /748 /1002 | 1041.0 | 0/148 |
| 2 /mixed | `order.create` | 194 /705 /902 | 863.0 | 0/151 |
| 4 /read | `/api/dashboard/basic/executive` | 18 /34 /51 | 472.0 | 0/735 |
| 4 /read | `/api/contacts` | 17 /33 /59 | 1027.0 | 0/738 |
| 4 /read | `/api/products` | 17 /32 /57 | 13670.0 | 0/736 |
| 4 /write | `attachment.upload` | 1361 /2447 /2878 | 430.0 | 66/268 |
| 4 /write | `order.create` | 732 /1376 /1624 | 863.0 | 0/269 |
| 4 /write | `invoice.create` | 730 /1325 /1673 | 1041.0 | 0/259 |
| 4 /mixed | `invoice.approve` | 139 /371 /464 | 2104.0 | 0/162 |
| 4 /mixed | `attachment.upload` | 125 /349 /520 | 526.0 | 0/164 |
| 4 /mixed | `invoice.approve-replay` | 144 /340 /511 | 2104.0 | 0/162 |


Ürün listesi yaklaşık 13,7 KB yanıtla read yolları arasında daha büyüktür; en yavaş endpoint olması veya serialization'ın ana darboğaz olması bu veriden çıkmaz. CPU profilleri Prisma/client ve GC maliyetini destekler; genel `JSON.stringify` kaldırma veya response sözleşmesi küçültme uygulanmadı. Attachment upload, provider taraması ve kota transaction'ları içeren karmaşık bir yoldur; sonuç yalnız SQL execution süresine indirgenemez.

## Kaynak ve transaction değerlendirmesi

Replica matrix'i boyunca örneklenen PostgreSQL bağlantı tepe değerleri 1/2/4 API için 11/17/28'dir; bunlar havuz limitlerinin toplamı veya PostgreSQL'in 100 bağlantı limitine dayanıldığı anlamına gelmez. API pool=5, worker pool=5, observer/tools bağlantıları ayrıca vardır. Örnekleme dışındaki transient bağlantılar kaçabilir. İlgili `resources.md` ve `resources.json` dosyaları gerçek ölçüdür; P2024 process counter maksimumu üç final matrix'te de 0'dır. Bu, her sorgunun pool'da sıfır süre beklediğini kanıtlamaz. İlk Faz 8'deki 6473 timeout daha eski kod ve farklı başarısızlık zincirine aittir.

PG lock waiter gözlemleri 1/2/4 API'de 3/4/10'a kadar çıkmıştır; deadlock 0. Finans/stok ve ortak kota hot-row kilitleri korundu. Yüksek VU'larda HTTP timeout'ları, API CPU sınırına dayanma, generator event-loop/cohort kaybı ve worker backlog birlikte bulunur; bunların hepsine yalnız eksik indeks denmez. API replikaları write üretimini artırırken tek worker'ın tüketim sınırını kaldırmaz. 4 API write/100'de 66 upload HTTP 409 ve sonradan 30 sn'yi aşan kuyruk yaşı, güvenli retry sınırlarının gerçek kullanıcı hatasını ve backlog'u görünür bıraktığını gösterir.

`79c197bb/read-baseline-sql.json` en yüksek toplam execution maliyetleri: access snapshot 5543 çağrı /0,304 ms ortalama /1685,9 ms toplam; ürün listeleme 1275 /0,322 /411,1; session ayarları 5543 /0,039 /218,8. Toplamlar ramp/warmup ve teşhis süresini de kapsar; bunlar steady-state istek başına SQL sayısı değildir. Çok sayıda kısa statement'ın Prisma ve round-trip maliyeti, yalnız veritabanındaki execution toplamından görünmez.

Aynı koşunun izole `EXPLAIN (ANALYZE, BUFFERS)` sonuçları:

| Plan | Execution ms | Gözlenen erişim |
|---|---:|---|
| Gerçek access snapshot | 1,882 | tenant+user unique, users/roles PK, ayar/override indeksleri; küçük tenant/plan tablolarında seq scan |
| Temsili membership | 0,221 | tenant+user unique ve user PK |
| Temsili plan features | 0,070 | Küçük plan tablosunda seq scan |
| Temsili ürün listesi | 0,201 | tenant/category indeksi +20 satırlık sort |
| Temsili mesaj geçmişi | 0,186 | tenant/conversation/createdAt/id indeksi |
| Temsili realtime audience | 0,328 | Yeni tenant/createdAt/id ve conversation/user üyelik indeksleri |

Tek seferlik plan süreleri endpoint benchmark'ı değildir; gerçek access sorgusunun ilk planning süresi 7,371 ms, diğerleri 1,040–3,604 ms arasındadır. Küçük tablodaki seq scan tek başına kusur değildir. Ürün listesi için ek sıralama indeksi bu fixture'da ana darboğaz olarak kanıtlanmadı; spekülatif ek indeks veya mevcut indeks silme yapılmadı.

Observer/tools konteyneri CPU ile sınırlı değildir; kısa gözlem işlemlerinde anlamlı CPU tüketir. Aynı hostta teşhis toplamak ücretsiz değildir. API CPU yüzdesi replica başına, toplam cluster CPU'su değildir. Socket başına güvenilir CPU/RSS türetilmedi: aynı örnekte HTTP, DB, GC ve tenant fanout da çalışır; farklı VU'ların RSS farkını doğrudan socket maliyeti saymak hatalı olur. Realtime paylaşılan tenant işini azaltır, bağlantı başına ağ ve buffer maliyetini yok etmez.

## Kaynak bütçesi deneyleri

Yeni fixture ve `phase81-release` image ile 20 sn ramp +10 sn warmup +30 sn ölçüm. `control`: 1 API/pool5, worker2 CPU/250 ms, proxy0,5 CPU/256 MiB. `pool10` yalnız API pool limitini 10 yapar. `proxy` proxy limitlerini birlikte 1 CPU/512 MiB yapar; CPU ve RAM'in ayrı nedensel etkisi ölçülmemiştir. `worker1` yalnız worker CPU limitini 1 yapar. Kuyruk deneyleri ayrıca 2 API/write500 ile aynı kontrollü yükte 250 ms ve 100 ms worker interval'larını karşılaştırır. SLO'lar ve iş akışları değişmez.

| Deney / kanıt | Profil / VU | RPS | Read p95 ms | Write p95 ms | Başarısız HTTP | Sonuç |
|---|---|---:|---:|---:|---:|---|
| control / `a2b3d5e2` | read / 100 | 103.23 | 323 | 0 | 0 | FAIL |
| control / `a2b3d5e2` | mixed / 100 | 85.57 | 1453 | 3081 | 0 | FAIL |
| pool10 / `9e5c5d89` | read / 100 | 106.40 | 157 | 0 | 0 | PASS |
| pool10 / `9e5c5d89` | mixed / 100 | 81.43 | 1173 | 2578 | 4 | FAIL |
| proxy / `5e86bff0` | read / 100 | 106.57 | 114 | 0 | 0 | PASS |
| proxy / `5e86bff0` | mixed / 100 | 88.93 | 977 | 1829 | 0 | FAIL |
| worker1 / `cca6d66c` | read / 100 | 107.73 | 85 | 0 | 0 | PASS |
| worker1 / `cca6d66c` | mixed / 100 | 111.17 | 496 | 1115 | 0 | FAIL |
| queue-control / `473fceef` | write / 500 | 98.23 | 7297 | 12075 | 77 | FAIL |
| queue-fast / `4005022b` | write / 500 | 100.87 | 6326 | 11256 | 19 | FAIL |


Pool10 read p95'i 323→157 ms düşürse de mixed FAIL ve dört başarısız HTTP vardır; bağlantı tepe sayısı 11→16, lock waiter 2→4 yükseldi. Proxy bütçesi artarken mixed 977/1829 ms ile yine FAIL, proxy örneklenen tepe tüketimi yalnız %10,4 CPU/33,6 MiB idi; limit artışına tek başına hızlanma atfedilemez. Worker1 mixed 496/1115 ms ile yine FAIL; worker örneklenen tüketimi %44,9 CPU ile bir çekirdek sınırının altındadır. Tekrar sayısı ve host değişkenliği, worker CPU azaltmanın genel bir hızlandırma olduğuna karar vermek için yetersizdir. Varsayılan kaynak/pool limitleri bu kısa deneylerden hareketle büyütülmedi veya daraltılmadı.

Queue-control/queue-fast: write500/2 API, generator p99 26,31/24,99 ms ile ölçümler geçerli. En eski örneklenen iş 29,67→22,56 sn, son toplam işlenmiş durable event 2004→2091; bunlar drain dahil lifecycle toplamıdır, steady throughput değildir. İki koşuda FAILED/DEAD_LETTER=0 ve queueHealthy=true. Write p95 12075→11256 ms, başarısız HTTP 77→19; iki koşu da FAIL. 100 ms polling bazı backlog'u azaltabilir fakat ağır write SLO'sunu çözmedi; production 10 sn varsayılanı bu deney için değiştirilmedi. Yerel yük fixture'ında kullanılan 250 ms zaten raporda açıkça belirtilmiştir.

## Geçersiz, kesilmiş ve reddedilmiş kanıtlar

| Kanıt | Kısıt / değerlendirme |
|---|---|
| İlk Faz 8 kesilmiş soak | Engine kesintisiyle yaklaşık 25 dakika; 30 dakika PASS sayılmadı. |
| `255c2613` | Eski kodla tamamlanan 25 VU/1800 sn PASS; son değişikliklerin soak kanıtı değildir. |
| `b0757e41` | 16 kısa HTTP kademesi dosyada mevcut; CPU profile dosyası shutdown sonrası bulunamadığı için controller başarısız. Profiler kanıtı veya eksiksiz başarılı koşu sayılmadı. |
| `d180fe2a` | CONCURRENTLY migration release transaction kilidini bekledi; yük başlamadan iptal edildi. Yeni normal migration aynı wrapper ile doğrulandı. |
| `2fb8846c` | Docker engine kesintisi; yarım keşif kapasite/soak kanıtı değildir. |
| `76bf8949` | Session-JSON adayı read gerilemesi üzerine reddedildi; kodu geri alındı, kalan profiller çalıştırılmadı. |
| `43c6d0af`, `9889e0de` | Ek history/join güvenlik düzeltmelerinden önceki keşifler; nihai sabit-image 48-kademe matrix'iyle birleştirilmedi. |
| `b4692c80` | Kaynak deneyinin ilk setup'ında kota ön kontrolü nonzero ile bitti; yük çalışmadı. Eski subprocess yardımcısı stdout JSON'unu kaybettiğinden başarısız kontrolün kesin nedeni kanıtlanamadı. PostgreSQL logunda serialization çatışmaları var; bunlar tek başına kota ihlalinin kanıtı değil. Başarısızlık korundu, PASS sayılmadı. Sonraki araç düzeltmesi nonzero JSON'u dosyaya kaydeder ve kontrol başarısızlığını durdurmaya devam eder. |
| Yüksek VU matrix satırları | `measurementValid=false`, eksik kohort veya generator event-loop p99≥100 ms olanlar INVALID. HTTP istatistikleri teşhis içindir; güvenilir kapasite olarak sunulmaz. Geçerli olup SLO'yu aşanlar ayrıca FAIL'dir. |

Başarılı bir yeniden çalıştırma, önceki başarısız/kesilmiş koşuyu silmez. İlk setup kotasının nedeninin belirlenememesi tekrarlanabilirlik sınırıdır; bu yüzden daha sonraki her koşunun üç planlı kota JSON'u ve invariant sonuçları ayrıca incelenir.

## Değişikliklerin yerleşimi

Backend kimlik okuması `modules/identity/infrastructure/user-access-snapshot.query.ts`, unread toplulaştırması `modules/collaboration/chat/infrastructure/persistence/unread-messages.query.ts`, fanout `infrastructure/realtime/{tenant-event-poller,prisma-realtime-reader,node-websocket-gateway}.ts` altında tutulur. Domain servislerine yük üreticisi mantığı eklenmedi. JWT anahtarı, tenant scope ve runtime ölçümü küçük `lib` yardımcılarıdır. Mevcut security-session çözümlemesi ortak `resolveSecuritySessions` fonksiyonuyla HTTP/WS'de aynı kuralları kullanır.

İndeks `prisma/schema/chat.prisma` ve additive migration `20261118003000_chat_realtime_polling_index` ile tanımlanır. Caddy düzeltmesi ortak release yapılandırıcısındadır. Node/Docker harness `scripts/performance`, kontrollü DB fixture/kota/telemetry `apps/backend/scripts/performance`, ortak fixture sözleşmesi `packages/types/src/performance.ts` içindedir. Web'in 100 ms invalidation birleştiricisi `features/chat/model/realtime-refresh.ts` ile sınırlıdır. Testler mevcut unit/cross-module ve release/performance araç suite'lerine eklenmiştir. Reddedilen session adayı dosyası/metotları bırakılmadı; başarısız deney dosyaları yalnız ignore edilen `artifacts/` kanıtlarıdır.

## Ayrı host ve staging gereksinimi

Mevcut 12 CPU/7,68 GiB paylaşılan host, 4 API'nin toplam 8 CPU limiti +PG2 +worker2 +web1 +proxy/Redis/provider için aynı anda ayrılmış CPU/RAM değildir. Docker limitlerinin toplamı fiziksel kapasiteyi aşar; bunlar reservation değildir. Bu nedenle high-VU sonuçları yalnız API replica sayısıyla açıklanamaz.

Bir sonraki test için **başlangıç deney tahsisi** olarak uygulama/DB/worker tarafına ayrı yaklaşık 16 vCPU/16 GiB host, generator tarafına ayrı yaklaşık 4 vCPU/4 GiB host ayrılabilir. Bu boyutlar 1750 VU için hesaplanmış veya doğrulanmış production kapasitesi değildir; mevcut konteyner bütçelerini daha az rekabetle çalıştırmak için başlangıçtır. DB disk/IOPS, ağ gecikmesi ve worker servisleri ayrıca ölçülmelidir. Provider simülatörü ve observer maliyeti de bütçeye katılmalıdır.

Generator'ı ayrı hosta taşımak tek Node event-loop sınırını ortadan kaldırmaz. 1750/2500 için çok process/host'a bölme, benzersiz VU/actor offset'i ve shard'lar arası beklenen mesaj alıcılarının koordinasyonu gerekir; mevcut tek-process harness'in bu özelliği varmış gibi sonuç üretilmedi. WS tek yönlü latency için host saatleri senkronize edilmeli, clock belirsizliği raporlanmalı. Closed-loop yanında sabit geliş oranlı açık yük testi ve backpressure davranışı ayrıca ölçülmeli.

Staging'de gerçekçi geçmiş veri boyutu, rol dağılımı, tenant/oda dağılımı, farklı sıcak ürün/kontaklar, gerçek provider sandbox, proxy/LB ağı ve tam tarayıcı oturumları gerekir. Mevcut actor'lar owner'dır; örneğin ilk 100 VU yalnız 20 tenant'ın ortak ürün/kontaklarını kullanır. Paylaşılan hot-row contention bu fixture'da anlamlıdır ama her müşteri dağılımının temsili değildir. 750 üstündeki VU'lar kullanıcıları tekrar kullanır. Post-load Chromium'daki dört sayfa kontrolü, eşzamanlı React render, saha Web Vitals, mobil veya tam navigasyon kapasitesi değildir.

## Kalan riskler

- Yüksek write/mixed gecikmesi ve ağır write sonrası tek worker backlog'u sürüyor. Daha çok API tek başına bu sınırı çözmüyor; sınırlı retry sonrası 409'lar gerçek iş akışı hatasıdır.
- 1750/2500 hedefleri bu ortamda geçmedi; INVALID ölçümler PASS'e çevrilmedi. Kısa ölçümler, soak dışında, uzun süreli kararlılık kanıtı değildir.
- Pool acquire wait için ayrı histogram, native Prisma engine fonksiyon bazında CPU attribution ve bağlantı başına izole bellek ölçümü yoktur. Bunların yerine başka metriği aynı isimle kullanmadık.
- İndeks migration'ı additive ancak canlı büyük tabloda yazmayı bloke edebilir. Production uygulanmadı; kontrollü deployment penceresi ve gerçek veriyle doğrulama gerektirir.
- Realtime, bounded overlap/dedup ve kalıcı HTTP geçmişi kullanır; sınırsız reconnect geçmiş replay'i vaat etmez. Güvenlik/session/oda üyeliği yeniden okunur, hata veya backpressure bağlantıyı görünür biçimde kapatır.
- İlk kaynak koşusunun kota setup başarısızlığında stdout kaybı kesin nedeni belirsiz bıraktı. Sonraki kontrol kodu kanıtı saklar; bu olay rapordan çıkarılmadı.
- Canlı provider, production/staging rollout, internet gecikmesi, backup/restore, aylık kullanılabilirlik veya gerçek maliyet teklifi bu yerel performans çalışmasıyla doğrulanmadı. Önceki bağımlılık bulguları ayrıca açık kalır.

## Son mixed kapasite keşfi ve soak

`ee61d1e4`: yeni izole fixture, `phase81-release`, dört API/pool5, worker2 CPU/250 ms ve standart proxy/generator bütçesi. 20 sn ramp +10 sn warmup +30 sn ölçüm; sıra 25/50/75/100. Bu koşuda ağır write500/1750/2500 profillerinin kuyruk kalıntısı yoktur; keşifler aynı DB üzerinde art arda çalışır. Her kademenin SQL invariant'ları geçti.

| Mixed VU | HTTP/sn | En kötü read p95 ms | En kötü write p95 ms | HTTP hata | Doğrulanmış teslim | Teslim p95 ms | Sonuç |
|---|---:|---:|---:|---:|---:|---:|---|
| 25 | 35,43 | 36 | 115 | 0 | 45/45 | 1013 | PASS |
| 50 | 68,53 | 147 | 454 | 0 | 85/85 | 1010 | PASS |
| 75 | 101,67 | 104 | 367 | 0 | 127/127 | 1060 | PASS |
| 100 | 126,13 | 380 | 1628 | 5 | 152/152 | 1029 | FAIL |

100 VU'daki beş başarısızlık `attachment.upload` HTTP409 /`CONFLICT` /sınırlı retry sonrası concurrent modification'dır; 5xx/transport=0 olması bu yanıtları başarıya çevirmez. 100 VU'nun read/write SLO'su da ayrıca başarısızdır. Keşifteki en yüksek başarılı mixed kademe **75 VU** olduğundan harness 1800 saniyelik soak'ı otomatik bu kademede seçti; `PERF_SOAK_STAGE` override edilmedi. Keşifteki PASS, uzun test sonucu tamamlanmadan güvenilir kapasite olarak kabul edilmez.

Soak tamamlandı: **1800 ölçülen saniye**, toplam lifecycle 1836,37 sn (20 sn ramp +10 sn warmup +tamamlama/teslim grace'i dahil), 176269 HTTP, 97,93 HTTP/sn. Ölçüm geçerli: 75/75 hazır kohort, generator event-loop p99 29,66 ms, en büyük progress aralığı 10,011 sn. Monotonic/duvar saati süre kontrolü geçti; engine kesintisi veya eksik kohort yok. Toplam sonuç **FAIL**, `successfulWorkflows=false`.

| Kabul koşulu | Gerçek sonuç | Değerlendirme |
|---|---|---|
| Read endpoint p95 <300 ms | En kötü 223 ms | PASS |
| Write endpoint p95 <800 ms | En kötü 741 ms | PASS |
| 5xx/transport <%0,5 | 0 /176269; 429 da 0 | PASS |
| Başarılı iş akışları | 101 beklenmeyen upload HTTP409 | **FAIL** |
| Realtime bağlantı | 75/75 VU hazır, 15 socket; socket failure 0 | PASS |
| Realtime teslim p95 <2000 ms | Doğrulanmış p95 1046, p99 1112, max 1647 ms | PASS |
| Beklenen bütün alıcılara teslim | 7233/7233, eksik/overflow 0 | PASS |
| Tenant/stok/finans/storage SQL invariant | 10 sayacın tamamı 0 | PASS |
| Üç planlı ERP/chat kota kontrolü | Her planda raceAccepted=10, rejected=15, iki kaynak; release sonrası 0 | PASS |
| FAILED/DEAD_LETTER | Tüm mevcut örneklerde 0 | PASS |
| En eski iş <=30 sn | Soak örneklerinde en çok 7,49 sn | PASS |
| Kesintisiz soak | Tam 1800 ölçülen saniye; generator geçerli | PASS |
| Hedef 1750/2500 kapasite | Matrix'te SLO başarısızlıkları/INVALID ölçümler | **FAIL / doğrulanmadı** |

101 hatanın tamamı `attachment.upload`: 7290 denemede 7189 HTTP201, 101 HTTP409; upload hata oranı %1,3855, tüm HTTP içindeki oranı %0,0573. Mesaj `Concurrent modification; refresh and retry.` ve kod `CONFLICT`: upload yolunda sınırlı Serializable retry tükeniyor. Bu bir kotanın aşıldığı veya storage sayacının bozulduğu kanıtı değildir; son `invalidStorageAccounting=0`. Hatanın reserve/commit alt adımını ayrı span ile ayıran kayıt yoktur; kesin alt-adım ataması yapılmadı. Yalnız retry sayısını büyütmek veya 409'u başarı kabul etmek uygulanmadı. Sonraki düzeltme storage kritik bölgesindeki lock/snapshot davranışını ve işlem süresini izole etmeli, kota/rollback/idempotency yarışlarıyla doğrulanmalı ve aynı bütçeyle yeniden soak edilmelidir.

Soak'taki yavaş write endpoint'leri (p50/p95/p99 ms): upload 150/741/1301, invoice.approve 159/615/954, approve-replay 165/613/975, payment.replay 109/403/721. Hatalar histogramda kalır. Percentile'lar bütün 1800 sn penceresinindir; her dakika için ayrı SLO kanıtı değildir.

185 adet soak kaynak örneği, toplam koşuda unavailable örnek 0. En yüksek pending 94, bağlantı 27, lock waiter 5, deadlock 0, API P2024 process counter maksimumu 0. En eski gözlenen açık transaction 5,44 sn; sürekli uzun transaction veya her kilit beklemesi bu tek tepe değerden çıkarılamaz. API process event-loop histogram p99 örnek tepe değeri 38,99 ms'dir; process histogramı önceki keşifleri de içerir. DB boyutu soak örnekleri arasında 61.847.219→261.994.163 byte büyüdü. Son drain sonrası pending/processing/failed/dead-letter=0, 23997 durable event işlenmiş; bu sayı keşif+soak+drain toplamıdır.

API process RSS ilk/son örnekleri replica sırasıyla 160,43→168,05; 160,59→168,74; 134,65→140,04; 160,17→168,66 MiB; örneklenen maksimum 171 MiB. Generator RSS başlangıç/son/tepe 63,25/108,65/112,37 MiB; bu büyüme kaydedildi, sıfır sızıntı veya sınırsız süre kararlılığı iddia edilmez. Docker'ın cache çıkarılmış bellek ölçüsü process RSS ile aynı değildir. Koşu genelindeki örnek tepe CPU'lar API replica başına %183,4, PG %209, worker %70,6, proxy %28, generator %70,5, observer %138,5; 100% bir çekirdektir ve bu ayrı tepe değerler aynı anda oluşmuş sayılmaz.

Post-load Chromium: login→dashboard, dashboard, products ve invoices dört ardışık gezinmede HTTP200 ve `failures=[]`. Login kontrolü önceden kurulmuş sentetik session ile dashboard'a yönlenir; formdan login doğrulaması değildir. İlk gezinme 4,87 sn/FCP2864 ms, sonraki FCP68/44/60 ms; bunlar yerel tek tarayıcı gözlemleridir. Son SQL invariant JSON'u ve browser JSON'u tamamlandı; koşunun konteyner/ağ/private fixture temizliği yapıldı. Controller başarılı çıkış olarak raporlanmaz; kayıtlı wrapper exit=1, stage sonucu FAIL'dir. Tamamlanma marker'ı ve sonuç dosyaları mevcut olsa da bu durum PASS'e çevrilmez.

## Güvenilir kapasite ve Faz 9 kararı

Bu son kodla kısa mixed keşifte 25/50/75 VU geçti, 100 VU geçmedi. **75 VU, 30 dakika boyunca tüm iş akışı koşullarını geçmedi; güvenilir mixed kapasite olarak onaylanamaz.** Daha düşük kademenin yeni kodla 30 dakika soak'ı çalıştırılmadı; eski kodun 25 VU sonucu otomatik devralınmadı. 100 VU read, aynı-image replica matrix'inde üç replica sayısında da geçti; ayrı kısa control koşusunda 323 ms ile FAIL olması host/iş yükü değişkenliğini gösterir. Production kapasitesi veya tüm profiller için tek bir kullanıcı sayısı garantisi verilmez.

**Karar: FAIL / performans kapısı için NO-GO.** Faz 9 backup/restore/DR hazırlığı bağımsız olarak yapılabilir, ancak Faz 8 kabul edilmiş veya pilot/production kapasitesi doğrulanmış gibi release kararı verilmemelidir. Önce upload 409 darboğazı güvenli biçimde giderilmeli; aynı kaynak/fixture ve mali iş akışlarıyla kısa keşif +en yüksek başarılı mixed kademede 1800 sn soak tekrar edilmelidir. Yüksek hedefler için ayrı generator ve gerçekçi staging gereksinimleri yukarıda belirtilmiştir. SLO'lar, authorization, kota, audit/outbox ve finans/stok invariant'ları bu sonuç için gevşetilmedi.
