# Faz 3: modüller arası doğrulama

13 Kasım 2026 yerel doğrulama: 10 dosyada **26/26** cross-module testi; backend **161/161**, web **60/60** birim testi; Chromium satış iş dosyası, dövizli fatura ve kalite onay/red akışları **3/3**; backend/cross-module ve web typecheck; değişen web dosyaları ESLint; module-boundary, Prisma architecture ve 4 CI altyapı testi geçti. Yeni TypeScript kodunda explicit `any` veya type bypass yok. Hosted GitHub Actions çalıştırılmadı; yerel PostgreSQL 18 kullanıldı, CI PostgreSQL 17 kullanır.

## Yapı

Backend HTTP composition root'u `bootstrap/http/create-app.ts`; modüller HTTP, application, domain ve infrastructure katmanlarına ayrılıyor. Finans, stok ve otomasyon işlemlerinin bir kısmı mevcut `services` katmanında. Bu değişiklik o servisleri kopyalamadan gerçek HTTP zincirlerini çalıştırır. Stok tüketimi `services/inventory-rules/consumption.ts`, marketplace durum politikası `modules/marketplace/domain`, webhook persistence'ı ilgili infrastructure dizininde, teslimat/iade uygulaması ayrı fulfillment servisindedir. Kullanılmayan marketplace rezervasyon ve durum senkronizasyon metotları kaldırıldı.

Web Next App Router kullanıyor; satış iş dosyası mevcut feature component'inde kalıyor. Playwright testinin HTTP istemcisi ve veri yaşam döngüsü `tests/e2e/fixtures` altında ayrıdır. Yeni yanıtlarda `unknown` ve Zod kullanılır; yeni kodda `any`, çift cast ve TypeScript suppression yoktur.

## Test sözleşmesi

`apps/backend/tests/cross-module/scenarios` altındaki dosyalar A–F zincirlerini çalıştırır. Hono uygulaması gerçek middleware/controller/service/repository ve PostgreSQL ile çalışır; HTTP transport in-process'tir. İş kuralları veya DB taklit edilmez. Stok, muhasebe, allocation ve tenant kontrolleri uygulamanın Prisma instance'ından ayrı bir DB istemcisiyle doğrulanır. Gerçek ağ ve tarayıcı kontrolü üç Playwright testindedir. Sağlayıcı hata kurtarma testi, dış sağlayıcıyı geçici yerel bir HTTP sunucusuyla temsil eder; gerçek Trendyol transport, retry ve ERP persistence kodu çalışır. Sunucu boş bir TCP portu seçer, gerçek socket bağlantılarını keser ve tekrar açar.

| Paket | Kanıt |
|---|---|
| A | Teklif → sipariş → kısmi teslim → indirim/KDV/fatura → paralel posting/tahsilat; stok çakışması; ters kayıt; rollback; tenant sınırı; kesirli tutarlar; USD zincirinin TRY muhasebe/cari mutabakatı |
| B | Talep/onay/sipariş → kısmi ve paralel mal kabul → fatura/eşleştirme/ödeme; fazla kabul; değişen retry payload'ı; fazla faturalama EXCEPTION |
| C | BOM/satış talebi/MRP → kapasite/iş emri → sarf/kalite onayı/mamul; rollback; paralel tamamlama ve retry; fire/kalite reddi; yeni üretimde onay geçersizleşmesi; gerçek kapasite tahsisi ve darboğaz |
| D | Listing yayını/soket kesintisi/retry/recovery → imzalı webhook → SKU eşleştirme → ERP siparişi/rezervasyon → teslim/iade; duplicate, eski durum, paralel otomasyon/iptal; stok hatasında replay; pasif entegrasyon |
| E | Varlık/servis/teknisyen/parça → rezervasyon → paralel tamamlama/fatura; fiziksel stok ve maliyet; eksik depo/yetersiz stok rollback; yetki/tenant |
| F | Gerçek tenant/plan/rol/token; kota ve modül yazma kilidi; permission grant/revoke; scoped API key/revoke; oturum logout/revoke |

Yeni tenant'ın eksik stok kanıtında HTTP MRP erişimi 409 olmalıdır. Üretim testi ayrıca gerçek stok operasyonlarını çalıştırıp 12 truth gate kontrolünün tamamının PASS olduğunu ve ardından HTTP MRP'nin 200 döndüğünü doğrular; kapı kaldırılmaz veya PASS verisi elle yazılmaz.

Normal ve otomatik tamamlamada mamul bakiyesi, WORK_ORDER referanslı stok hareketi ve değerleme aynı `finished-goods.service.ts` üzerinden yazılır. Mamul birim maliyeti gerçekleşen malzeme/işçilik/genel gider toplamından fire maliyeti düşülerek hesaplanır. BOM zinciri 160 TRY sarf maliyetinin iki mamulde 80 TRY/birim, 160 TRY stok değerlemesi ve dengeli üretim journal'ı olarak izlenmesini doğrular. Otomatik tamamlamada aynı key/iş emri tekrarları ikinci çıktı üretmez; kalite onaylı miktar çağrı parametresiyle artırılamaz.

## Çalıştırma

Yalnızca bu test için ayrılmış, adı `phase3_*_ci` olan boş PostgreSQL veritabanı kullanılır. `CROSS_MODULE_DATABASE_URL` zorunludur. Suite seri çalışır; her test öncesi/sonrası bu veritabanındaki public tabloları temizler; migration tablosunu korur. Temizlik öncesi gerçek `current_database()` kimliği de doğrulanır. Paylaşılan veritabanına bu adı vermeyin. Aynı DB üzerinde başka suite çalıştırmayın.

```powershell
$env:CROSS_MODULE_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/phase3_local_ci?schema=public'
$env:DATABASE_URL=$env:CROSS_MODULE_DATABASE_URL
npm.cmd --workspace=@repo/backend run db:migrate:deploy
npm.cmd run test:cross-module
```

JSON ve JUnit raporları `artifacts/cross-module/` altında oluşur. CI'da bağımsız PostgreSQL servisi kullanan zorunlu `cross-module` işi eklendi. Satış Playwright testi PR browser-smoke işinde ve tam regression grubunda çalışır.

Tarayıcı testi için ayrı `*_ci` DB migrate/seed edilir, `CI=true` ile `prepare-browser-fixtures.ts` çalıştırılır ve API localhost:3001 üzerinde başlatılır. Web runner localhost:3100 üzerinde açılır:

```powershell
npm.cmd run test:e2e:cross-module
```

## Tamamlanan eksikler ve davranış sözleşmesi

- Teklif, sipariş, fatura ve ödeme sözleşmeleri para birimi/kur taşır. Belge tutarları kendi para biriminde; cari ve journal tutarları kur snapshot'ıyla TRY olarak tutulur. Dönüşüm Decimal ile iki haneye yuvarlanır, journal yuvarlama farkı net satıra dağıtılır. Ödeme/fatura ve kasa/banka para birimi eşleşmelidir. Otomatik kur farkı muhasebesi bu değişikliğe dahil değildir; farklı kurla tahsisat kontrollü 400 ile reddedilir. TRY kuru 1 olmalı, yabancı para için kur açıkça verilmelidir.
- `qualityRequired: true` iş emirleri PENDING başlar. `POST /api/production/work-orders/:id/quality-decisions`, production UPDATE yetkisiyle gerekçeli APPROVED/REJECTED kararı ve idempotency key kabul eder; karar history'ye kaydedilir. PENDING/REJECTED, hem normal hem otomatik tamamlamayı engeller. Yeni üretim bildirimi onayı PENDING yapar; eski key'in tekrar gönderilmesi yeni çıktıyı onaylamaz. Mevcut iş emirlerinin varsayılanı NOT_REQUIRED olarak korunur. Web formunda zorunluluk seçimi ve detayda onay/red paneli vardır.
- Three-way match EXCEPTION durumundaki satın alma faturası onaylanamaz; journal ve cari kayıt oluşturulmaz.
- Kapasite aşımı kritik darboğaz olarak raporlanır; mevcut kapasite planlama davranışı sert başlangıç limiti değildir.
- Listing testi dış sağlayıcı sınırında kontrollü HTTP sunucusu kullanır. Canlı sağlayıcı sandbox kimlik bilgileriyle yayın ve hosted CI bu oturumda çalıştırılmadı; bunlar yerel test başarısı olarak gösterilmez.
- Genel code-quality kontrolünde mevcut script/mobile ve büyük dosya borçları nedeniyle 358 bulgu vardır. `.next-e2e` artık üretilmiş dosya olarak hariç tutulur. Faz 3 typecheck/lint başarısı bu genel borcun kapatıldığı anlamına gelmez.

İki yeni migration yalnız izole test veritabanlarına uygulandı: ödeme kur snapshot'ı ve iş emri kalite kararı/history. Gerçek ortama alınmadan önce `db:migrate:deploy` gerekir. Faz 3'ün yerel A–F uygulama ve regresyon kapsamı tamamlandı; hosted CI ve canlı sağlayıcı kabulü ayrıca doğrulanmalıdır.
