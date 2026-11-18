# Faz 8 — Yerel ölçüm sonucu (2026-11-17)

Matrix run: `axon-perf-8edac125`; kesintisiz soak run: `axon-perf-255c2613`. Bu sonuç izole yerel Docker içindir; production kapasitesi veya aylık availability doğrulaması değildir. Çalıştırma ve sınırlamalar: [runbook](phase-8-performance.md).

## Ortam ve yöntem

Docker Desktop Linux: 12 logical CPU, 7.68 GiB RAM. 150 sentetik tenant, 750 kullanıcı ve tenant başına 201 ürün. Tek API replica: 2 CPU/1 GiB, pool=5; worker: 2 CPU/1 GiB, pool=5; PostgreSQL: 2 CPU/1 GiB. Worker interval=250 ms. Ayrıntılı bütçe runbook'tadır.

Her kademede 20 saniye ramp, 10 saniye warmup, 30 saniye ölçüm; 1000 ms think time. Soak penceresi 1800 saniyedir. Matrix kademeleri aynı fixture ve biriken veriyi kullanır. İlk soak yaklaşık 25. dakikada Docker engine kesintisiyle durdu (exit 137, OOMKilled=false); tamamlanmış sayılmadı. Yeni boş fixture ile ayrı bir 30 dakikalık soak alındı. Yeni generator, 20 saniyeyi aşan çalışma/duvar saati kesintilerini de geçersiz sayar. 1750/2500 VU, 750 benzersiz kullanıcının birden fazla oturumunu içerir. Aynı makinede başka build/test çalıştırılmadı.

## Kapasite ve sınırlar

Bu kaynak bütçesinde read, write ve mixed profilleri 25 VU'da kısa pencere SLO'larını sağladı. Daha yüksek kademeler SLO'yu karşılamadı. 1750/2500 VU desteklenen kapasite olarak sunulamaz. Geçersiz generator ölçümleri kapasite karşılaştırmasına dahil edilmez; toplam HTTP hızı başarısız yanıtları da içerir.

| Profil | VU | Ölçüm sn | Toplam HTTP/sn | Read p95 ms | Write p95 ms | Ölçüm geçerli | 5xx/transport | SLO |
|---|---:|---:|---:|---:|---:|---|---:|---|
| read | 25 | 30 | 27.0 | 31 | — | evet | 0 | PASS |
| read | 100 | 30 | 89.2 | 560 | — | evet | 0 | FAIL |
| read | 500 | 30 | 100.6 | 6339 | — | evet | 0 | FAIL |
| read | 1750 | 30 | 106.2 | 15005 | — | evet | 3187 | FAIL |
| read | 2500 | 30 | 173.9 | 15035 | — | evet | 5217 | FAIL |
| write | 25 | 30 | 44.6 | 273 | 535 | evet | 0 | PASS |
| write | 100 | 30 | 47.7 | 2425 | 4062 | evet | 0 | FAIL |
| write | 500 | 30 | 49.3 | — | 15005 | evet | 609 | FAIL |
| write | 1750 | 30 | 412.7 | — | 15676 | hayır | 12382 | FAIL |
| write | 2500 | 30 | 114.7 | — | 27458 | hayır | 3440 | FAIL |
| realtime | 25 | 30 | 23.6 | 376 | 488 | evet | 0 | FAIL |
| realtime | 100 | 30 | 30.9 | 3188 | 3987 | evet | 0 | FAIL |
| realtime | 500 | 30 | 33.5 | 14401 | 15003 | hayır | 242 | FAIL |
| realtime | 1750 | 30 | 50.3 | 15021 | — | hayır | 1508 | FAIL |
| realtime | 2500 | 30 | 181.7 | 15068 | 15066 | hayır | 5423 | FAIL |
| mixed | 25 | 30 | 33.6 | 229 | 785 | evet | 0 | PASS |
| mixed | 100 | 30 | 65.6 | 1794 | 3497 | evet | 0 | FAIL |
| mixed | 500 | 30 | 57.7 | 11523 | 15002 | hayır | 167 | FAIL |
| mixed | 1750 | 30 | 119.5 | 15113 | 15084 | hayır | 3231 | FAIL |
| mixed | 2500 | 30 | 199.4 | 15037 | 15033 | hayır | 5329 | FAIL |
| soak | 25 | 1800 | 34.0 | 117 | 284 | evet | 0 | PASS |

25 VU realtime profilinde 25 bağlantı açıldı; 0 bağlantı hatası, 652 mesaj teslimi ve 150 pong ölçüldü. Teslim p95 959 ms olmasına rağmen sohbet listeleme API'sinin read p95'i hedefi aştı; profil PASS olarak işaretlenmedi.

API'nin 2 CPU sınırına dayandığı örneklerde PostgreSQL CPU kullanımı belirgin biçimde daha düşüktü. Yüksek kademelerde Prisma pool beklemeleri, timeout ve WebSocket kayıpları oluştu. Bunlar bu hostta daha büyük DB gerekliliğini tek başına kanıtlamaz. Sonraki kapasite çalışması, daha güçlü ayrı yük üreticisi, yeterli host bütçesi, API replica karşılaştırması ve sohbet sorgusu/fanout profilini içermelidir. Ölçülmemiş bir ölçekleme kazancı varsayılmadı.

Proxy de yüksek kademelerde 0,5 CPU/256 MiB bütçesine yaklaştı; generator doğrulaması bazı kademelerde başarısız oldu. Bu nedenle stres sonuçları tek bir API tavanına indirgenmemeli, bütün kaynak bütçesiyle birlikte okunmalıdır.

## Soak ve bütünlük

Soak sonucu: **PASS**, 1800 ölçülen saniye, 34.0 toplam HTTP/sn, 0 başarısız yolculuk, 0 HTTP 5xx, 0 transport hatası, 0 HTTP 429, 0 integrity/isolation ihlali. 5 WebSocket, 0 bağlantı hatası, 2513 teslim edilen olay; teslim p95 955 ms.

Soak API süreç RSS'i ilk/son örnekte 156.4/168.5 MiB; heap 46.2/54.9 MiB. Soak sırasında yeni pool timeout: 0. Örneklenen süreç event-loop p99 tepe değeri 27.5 ms; histogram süreç ömrünü kapsar, önceki kısa karma doğrulamayı ve warmup'ı da içerir. Generator'ın en uzun ilerleme aralığı 10002 ms oldu; 20 saniyelik kesinti sınırı aşılmadı. Tek koşu bellek sızıntısı olmadığının genel kanıtı değildir. Kaynak tablolarındaki bellek Docker stats container kullanımını gösterir; süreç RSS/heap ölçümleriyle aynı tanımda değildir.

Her 20 matrix kademesinden ve soak'tan sonra SQL invariant'ları kontrol edildi. Son kontrol: **PASS**. Kontroller: negatif stok, fazla/nonpositive allocation, tenant sınırı, duplicate ödeme/stok/journal referansı, dengesiz journal ve rezervasyon muhasebesi. Bağımsız correctness testinde 25 eşzamanlı tüketici 5 stok biriminden fazlasını alamadı; 25 ödeme replay'i tek tahsilat/allocation üretti.

Üç planın ortak ERP/chat 10 KiB kota yarışı: **PASS**. Her planda 25 yarışmacı, 10 kabul/15 ret, limit aşımı engeli ve release sonrası sıfır reserved bytes doğrulandı. Fixture override'ı yalnız bu expendable tenant'larda uygulandı; normal plan limitleri değiştirilmedi.

Kuyruk son durumu: {"pending":0,"processing":0,"failed":0,"deadLetter":0,"processed":7824,"oldestSeconds":0,"processingP95Seconds":0.29084999999999944}. Örneklenen maksimum DB connection 11, lock waiter 2, deadlock 0. Tam kaynak tablosu aşağıdadır. Queue p95 tüm koşunun tamamlanan işlerini kapsar.

## Tüketim ve maliyet

Aşağıdaki tüketim ayrı ve kesintisiz soak ortamına aittir; matrix veya yarım kalan soak tüketimiyle toplanmamıştır. Matrix tenant maliyetleri eski run klasöründeki matrix-report.md dosyasındadır.

| Plan | Tenant | Son depolama byte | Upload byte | Download byte | AI token |
|---|---:|---:|---:|---:|---:|
| STARTER | 50 | 1113024 | 1113024 | 1113024 | 0 |
| PROFESSIONAL | 50 | 1107744 | 1107744 | 1107744 | 0 |
| ENTERPRISE | 50 | 556512 | 556512 | 556512 | 0 |

Son PostgreSQL boyutu 108730035 byte; fiziksel sayfa/index/bloat dahil tüm test DB'sidir, tenant başına gerçek fatura değildir. Yerel provider 2630 nesne/2777280 byte ve 2630 tarama kaydetti. Provider ile DB sayıları farkları, yarım kalmış veya reddedilmiş yüklemeleri araştırmak için ham artifact'larda tutulur.

Örnek fiyat girdisindeki 100 USD/ay altyapı bütçesi 150 tenant'a eşit paylaştırılırsa tenant başına 0,6667 USD/ay sabit pay çıkar; bu bir fiyat teklifi değildir. Değişken maliyet: depolanan GiB × 0,02 USD/GiB-ay + yalnız gözlenen indirme GiB × 0,09 USD/GiB. AI ve ücretli dış API kullanılmadı. Gerçek tüketim/pricing ile `PERF_PRICING_FILE` üzerinden tekrar hesaplanmalıdır. Kısa koşudan aylık trafik veya maliyet projeksiyonu yapılmadı; bu tutarlar production maliyet taahhüdü değildir.

## Browser ve regresyon

Yük sonrasında yerel Chromium ile dört ardışık navigation ölçüldü: /login: HTTP 200, JS hata 0, FCP 2836 ms; /dashboard: HTTP 200, JS hata 0, FCP 52 ms; /dashboard/products: HTTP 200, JS hata 0, FCP 52 ms; /dashboard/invoices: HTTP 200, JS hata 0, FCP 64 ms. Bu idle browser baseline'ıdır; eşzamanlı browser kapasitesi veya saha Web Vitals sonucu değildir.

392 unit testi, 92 çapraz modül testi, 18 release testi ve 10 performans aracı testi geçti. Workspace typecheck, mimari/tenant/security/permission guard'ları, types layout ve production image build'leri geçti. Lint hata vermedi; mevcut dosyalardaki 10 uyarı sürüyor. Değişen TypeScript kaynaklarında AST taraması explicit `any` veya kullanılmayan import bulmadı.

## Ham kanıt

Gitignore kapsamındaki `artifacts/performance/axon-perf-255c2613/`: `results.json`, kademe JSON/log/invariant dosyaları, `resources.json`, `environment.json`, `database.json`, `quota.json`, `provider.json`, `browser.json`, `report.md`, `resources.md`. Credential/fixture dosyaları geçici alanda tutuldu. Yeni koşunun dosyaları otomatik cleanup ile silindi; kesintili eski koşunun credential dosyalarını silme isteği otomatik onay denetimince blocked by policy gerekçesiyle reddedildi. Eski test DB/container/network kaldırıldı; bu credential değerleri canlı bir ortama erişim sağlamaz. Tekrar üretme: `PERF_SKIP_BUILD=true`, `PERF_RAMP_SECONDS=20`, `PERF_WARMUP_SECONDS=10`, diğer parametreler varsayılan; mevcut kaynaklardan image'ları önce derlemek gerekir.

## Matrix kaynak örnekleri (axon-perf-8edac125)

Docker CPU 100% represents one logical core. These are sampled peaks; short spikes can be missed.

| Role | Peak CPU % | Peak resident/container MiB |
|---|---:|---:|
| web | 17.7 | 71.2 |
| worker | 49.1 | 79.4 |
| api (per replica peak) | 213.6 | 516.1 |
| tools | 149.4 | 27.1 |
| proxy | 52.5 | 255.4 |
| provider | 4.5 | 19.6 |
| certificate | 0.1 | 0.4 |
| redis | 3.7 | 5.9 |
| postgres | 85.4 | 170.7 |
| load generator | 139.8 | 761.9 |

Observed DB connections: 11; simultaneous lock waiters: 2; deadlocks: 0; API pool timeouts (maximum process counter): 6473. Maximum observed oldest queue age: 0.33s. Processed durable events: 3248. Resource JSON includes SQL query IDs and timings, queue completion p95, per-process heap/event loop metrics and timestamps for further comparison. Raw SQL operation timings are available through PostgreSQL; Prisma operation metrics exclude raw SQL.


## Soak kaynak örnekleri (axon-perf-255c2613)

Docker CPU 100% represents one logical core. These are sampled peaks; short spikes can be missed.

| Role | Peak CPU % | Peak resident/container MiB |
|---|---:|---:|
| web | 19.6 | 81.4 |
| worker | 37.4 | 79.9 |
| api (per replica peak) | 198.6 | 116.0 |
| tools | 85.2 | 2.8 |
| proxy | 5.8 | 19.7 |
| provider | 1.6 | 25.3 |
| certificate | 0.0 | 0.7 |
| redis | 1.9 | 8.2 |
| postgres | 55.1 | 215.3 |
| load generator | 14.6 | 48.9 |

Observed DB connections: 11; simultaneous lock waiters: 2; deadlocks: 0; API pool timeouts (maximum process counter): 0. Maximum observed oldest queue age: 0.29s. Processed durable events: 7824. Resource JSON includes SQL query IDs and timings, queue completion p95, per-process heap/event loop metrics and timestamps for further comparison. Raw SQL operation timings are available through PostgreSQL; Prisma operation metrics exclude raw SQL.

