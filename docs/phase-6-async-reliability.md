# Faz 6 — Async işler, outbox ve entegrasyon güvenilirliği

16 Kasım 2026 son yerel sonuç: **16 dosyada 86/86** HTTP/PostgreSQL/Node TCP testi ve **357/357** birim testi başarılı. Backend/web/mobil tip kontrolleri, backend/web üretim derlemeleri, web ESLint ve güvenlik/mimari kontrolleri geçti. Boş DB kurulumu ve eski veriyle migration yükseltmesi doğrulandı.

## Akış envanteri

| Akış | Kalıcı sınır ve yürütme |
|---|---|
| Fatura / tahsilat | İş kaydı, zorunlu audit ve olay aynı transaction içinde. API consumer çalıştırmaz. |
| Fatura onayı / servis tamamlaması | Finansal işlem, e-belge oluşturma ve gönderim niyeti birlikte commit edilir. Eski `void ...catch()` ve zamanlayıcı bağımlılığı kaldırıldı. |
| Tekliften sipariş, otomatik satış faturası, OCR faturası, muhasebe fişi, üretim durumu, manuel stok | Mevcut yayıncıların commit sonrası olay boşlukları kapatıldı; olay iş transaction'ında oluşturulur. Stok sinyalleri hareket kimliğiyle ayrılır. |
| Kullanıcı e-postası, toplu e-posta, rapor, tenant daveti | Mail geçmişi, ekler dahil değişmez sağlayıcı içeriği ve gönderim olayı birlikte commit edilir. HTTP kabulü teslimat anlamına gelmez. |
| Demo / eski admin tenant oluşturma / tenant provisioning | Hesap ve parola bağlantısıyla ilgili e-posta niyeti aynı transaction'da. Provisioning isteği kalıcıdır; API kapanırsa worker devam eder. Kurulum, e-posta gerçekten teslim edilince başarılı olur. |
| Gelen Trendyol webhook | HMAC/timestamp kontrolünden sonra receipt ve outbox birlikte commit edilir; 202 yanıtından sonra sipariş/stok etkisi worker'da oluşur. |
| Trendyol sync işleri | Mevcut `marketplace_sync_jobs` kuyruğu kullanılır. Atomik claim, her claim için ayrı sahiplik kimliği, deneme limiti ve kalıcı hata ayrımı uygulanır. Polling ve HTTP aynı iptal süresini paylaşır. |
| Bildirim, audit, görev consumer'ları | Her consumer'ın etkisi ve tamamlanma receipt'i aynı DB transaction'ında. Başarılı consumer tekrar teslimatta atlanır. |
| Platform admin daveti | Ayrı admin realm'inde senkron sözleşmesi korunur: başarısız gönderim 502 döner ve davet token'ı geçersizleştirilir; tenant kuyruğuna sahte tenant kimliği eklenmez. |

Catalog'daki `planned` yayıncılar sonraki iş akışlarının envanteridir; mevcut çalışan üreticilerin kapsamı `covered` kayıtlarında belirtilir. Chat/storage worker'ları kendi mevcut kuyruklarını kullanır; ortak worker backoff'u jitter içerir.

## Sorumlulukların yerleşimi

- `domain-events/outbox.ts`: Transaction içinde kalıcı niyet ve JSON dönüşümü. DB yazılamazsa bellekte teslimat yapılmaz.
- `domain-events/bus.ts`: Yalnız consumer kaydı ve listesi. Kullanılmayan bağımsız publish/persist yolu kaldırıldı; iş kayıtları `enqueueDomainEvent(tx, event)` kullanır.
- `domain-events/event-codec.ts`: v1/v2 olayları için runtime doğrulama; tenant-context eşleşmesi ve tarih/alan kontrolleri.
- `domain-events/delivery/`: Claim/recovery, sahiplik kontrolü, consumer transaction'ları, retry ve operatör replay'i.
- `services/mail-delivery/`: Mail snapshot'ı, tek sağlayıcı denemesi, teslimat ve provisioning tamamlama bağı.
- `services/edocument/delivery-intent.ts`: Fatura/e-belge/gönderim niyetinin aynı transaction'da kurulması.
- `infrastructure/providers/`: HTTP hata sınıflandırması, Retry-After ve job boyunca taşınan iptal sinyali.
- `modules/marketplace/domain/` ve `infrastructure/webhooks/`: Payload/state mapping ile kalıcı webhook işleme ayrımı.
- Modüllerin `infrastructure/index.ts` girişleri worker adapter'larını HTTP route'larını yüklemeden sunar. Mimari kontrol yalnız bu açık girişleri kabul eder; özel dosya import'ları denetlenmeye devam eder.

Yeni kod explicit `any`, `@ts-ignore`, `@ts-nocheck` veya çift assertion içermez. Eski bellek içi teslimat fallback'i, tekrar publish ederek dispatch etme yolu, kullanılmayan e-belge submit metodu ve eski mail completion yolu kaldırıldı.

## Teslimat sözleşmesi

Outbox worker'ı `FOR UPDATE SKIP LOCKED` ile sıradaki işi işlemeye başlamadan hemen önce alır. Claim kimliği her denemede değişir; eski worker yeni claim'i başarıya veya hataya çeviremez. Consumer transaction'ı outbox satırını kilitler, sahipliği doğrular, etkisini ve receipt'ini birlikte commit eder. DB'deki bileşik tenant/outbox FK'si başka tenant'ın olayına receipt bağlanmasını da reddeder.

Varsayılan otomatik deneme bütçesi 5'tir. Gecikme exponential backoff ve equal jitter kullanır. Retry-After saniye veya HTTP-date olarak okunur ve 15 dakika tavanlı gecikme politikasına katılır. Kalıcı 4xx dead-letter olur; bağlantı, timeout ve 5xx kontrollü yeniden denenir. Operatör replay'i işi tekrar kuyruğa alır ve yeni deneme bütçesi verir; tamamlanmış consumer receipt'leri korunur. Karantina/çözümlenmiş kayıtlar çalıştırılmaz. `attempts`, mevcut replay turunun sayacıdır.

Resend 409 yanıtında `concurrent_idempotent_requests` ve `resource_locked` kontrollü retry alır; `invalid_idempotent_request` ve bilinmeyen conflict kodları kalıcı hata kabul edilir. Bu ayrım [sağlayıcının hata sözleşmesine](https://resend.com/docs/api-reference/errors) göre gerçek TCP testleriyle doğrulandı; aynı anahtarla değiştirilmiş içerik için otomatik retry yapılmaz.

Mail, sabit sağlayıcı idempotency anahtarı ve değişmez içerikle gönderilir. [Resend anahtarları 24 saat saklar](https://resend.com/docs/dashboard/emails/idempotency-keys); belirsiz bir teslimatın ilk denemesinden 23 saat sonra otomatik/manuel aynı gönderim durdurulur ve sağlayıcı uzlaştırması gerekir. Süresi dolmuş işlem bağlantısı gönderilmez. Bu sözleşme sınırsız exactly-once iddiası değildir. E-posta içeriği/ekler outbox payload'ına kopyalanmaz; mevcut erişim kontrollü mail kaydında tutulur, başarılı teslimattan sonra ek gönderim snapshot'ı temizlenir.

Provisioning'in e-posta sonucu tenant ve deneme numarasıyla eşleşir. Eski bir sonuç yeni denemeyi tamamlayamaz. Son worker denemesinde process kapanırsa lease recovery, mail ve provisioning durumunu başarısız sonuca taşır. Kalıcı başarısızlık ve yeniden deneme UI'da görülebilir.

E-belgedeki mevcut mock adapter worker içinde çalışır. Yapılandırılmamış gerçek production adapter'ı kalıcı hata verir. İptal edilmiş fatura gönderilmez; geç provider callback'i `CANCELLED` veya `PAID` faturayı `SENT` durumuna geri çeviremez.

## Web davranışı

İş kuyruğu ekranı bekleyen/işlenen/başarılı/başarısız durumlarını filtreler; deneme sayısı, sonraki deneme, hata nedeni ve tamamlanan consumer'ları gösterir. Yeniden deneme HTTP isteği provider çalıştırmaz. Mail, rapor ve e-belge mesajları kuyruğa kabul ile gerçek teslimatı ayırır. Bekleyen mail ve provisioning ekranları durum değişimini periyodik olarak okur; biten işlerde polling durur. Yeni web şemaları eski API satırlarında bulunmayan alanları varsayılanlarla okuyabilir.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| HTTP/PostgreSQL/gerçek TCP cross-module | 16 dosyada 86/86 başarılı; 301,80 saniye; exit 0 |
| Backend / web / mobil unit | 172 / 66 / 119 başarılı |
| Ortak tipler / backend / web / mobil typecheck | Başarılı |
| Module boundaries, Prisma architecture/validate, API contracts | Başarılı |
| Statik tenant isolation / 130-model runtime guard / permission gating / hardening | Başarılı |
| Backend üretim derlemesi / web ESLint | Başarılı |
| Web üretim derlemesi | Başarılı |
| Boş PostgreSQL migration deploy | Başarılı |
| Önceki migration setinden, eski mail ve v1 olay korunarak yükseltme | Başarılı |

`tests/cross-module/scenarios/async-delivery.test.ts` 27 senaryo içerir: worker kapalıyken commit, rollback, concurrent worker, gerçek alt süreç çıkışı, eski lease fencing, consumer rollback, effect sonrası ack hatası, dead-letter/replay, tenant FK, karışık event sürümleri, gerçek TCP üzerinde timeout/500/429/409/accept-then-disconnect, eklerin korunması, süresi dolmuş bağlantı, webhook imzası/kalıcı kabul, e-belge ve geç callback, provisioning teslimatı/retry/son-deneme çökmesi ve marketplace deneme limitleri.

Tekrar incelemede webhook kabulünde iki hata düzeltildi. DB/outbox yazım hataları artık geçersiz payload gibi 400 döndürmez: 503 ve `Retry-After: 5` döner; veritabanı ayrıntısı istemciye verilmez. Toplu webhook'un tüm paketleri kayıt başlamadan doğrulanır; eksik alan, nesne olmayan eleman ve geçersiz tarih sessizce atlanıp 202 ile kabul edilmez. `webhook-intake.test.ts` içindeki dört yeni test, düzeltme öncesinde hataları üretti; son toplu koşuda geçti. Gerçek PostgreSQL trigger'ıyla kayıt hatası, receipt/outbox rollback'i, tekrar kabul ve tek sipariş/rezervasyon etkisi doğrulandı. Dört kullanılmayan import ve bağımsız publish/persist sarmalayıcıları temizlendi; transaction bloklarının girintileri düzenlendi. 2.211 TypeScript/TSX dosyasının tamamı bir `tsconfig` kapsamındadır.

Son tekrar inceleme kanıtları (`artifacts/` altında): `phase6-review-cross-module.log`, `cross-module/results.json`, `cross-module/junit.xml`, `phase6-review-unit.log`, `phase6-review-backend-unit-final.log`, `phase6-review-typecheck.log`, `phase6-review-guards-final.log`, `phase6-review-backend-build-verified.log`, `phase6-review-web-build.log`, `phase6-review-web-lint.log` ve `phase6-review-imports.log`. Şema değişmedi; önceki boş DB/upgrade kanıtları `phase6-migrate-empty-final.log`, `phase6-migrate-upgrade.log` ve `phase6-upgrade-evidence.log` içinde korunur.

Test DB'leri yalnız `phase3_*_ci` adlarıyla, ayrı PostgreSQL 18 container'ında kullanıldı. Yerel Windows PL/pgSQL DLL'i işletim sistemi tarafından engellendiği için testler Docker'a alındı. Çalışan geliştirme sürecinin kilitlediği Prisma DLL'ine dokunulmadı: aynı engine hash'i doğrulanarak izole client üretimi kullanıldı; toplu typecheck otomatik generate prehook'u olmadan çalıştırıldı. Ortak tip paketi derlemesi ile onu kullanan testler sıraya alındı. Gerçek/development/production DB değiştirilmedi.

## Migration ve sürüm geçişi

Yeni migration: `20261116120000_domain_event_consumer_receipts`. Nullable mail alanları, consumer receipt tablosu ve tenant/outbox bütünlük indeksi ekler. Önceki şemadaki tenant, mail içeriği ve v1 PENDING olayın yükseltmeden sonra korunduğu ayrı DB'de doğrulandı.

Eski senkron gönderimden kalan, idempotency anahtarı/snapshot'ı olmayan PENDING mail kayıtları korunur ve otomatik tekrar gönderilmez. Bu tarihsel belirsiz teslimatlar sağlayıcı kayıtlarıyla uzlaştırılmalıdır; eksik ek içeriği veya eski sağlayıcı kabulü tahmin edilmez.

API ve worker aynı codec/sürüm sabitini kullanır. Mevcut olaylar v1, yeni teslimat istekleri v2 olarak yazılır. Yeni worker v1'i okur; kapasitesini aşan sürümler claim edilmez, deneme bütçesi tüketilmez. Additive eski payload'lar ve v1 kapasitesiyle v2 claim etmeme gerçek sorgu/testlerle doğrulandı.

Geçiş sırası: additive migration; eski worker'ları durdurup devam eden işleri/process'leri tamamen boşaltma; API sürümlerini geçirme; yeni worker'ı başlatma. Kuyruk bu aralıkta kalıcı olarak birikir. Eski fencing/receipt desteği olmayan worker binary'si yeni worker'la birlikte çalıştırılmamalıdır. API rollback'inde v2 backlog için uyumlu worker korunmalıdır. Yerel testler eski binary'nin yeni protokolü desteklediğini veya canlı rolling deployment yapıldığını iddia etmez.

```powershell
$env:CROSS_MODULE_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/phase3_local_ci?schema=public'
npm.cmd --workspace=@repo/backend run db:migrate:deploy
npm.cmd run typecheck
npm.cmd run test:guards
npm.cmd run test:unit
npm.cmd run test:cross-module
npm.cmd run build
# API'den ayrı worker süreci:
npm.cmd --workspace=@repo/backend run worker:domain-events
```

`migrate deploy` için `DATABASE_URL` ayrıca hedef test DB'ye ayarlanmalıdır; `CROSS_MODULE_DATABASE_URL` yalnız test runner'ın güvenli seçimidir. Hedef ortama migration/deploy yapılmadı. Canlı Resend/GİB/Trendyol, hosted CI ve production restart/rolling deployment bu yerel kanıtın kapsamında değildir. Önceki fazda kaydedilmiş bağımlılık riskleri bu çalışmayla kapanmış sayılmaz.
