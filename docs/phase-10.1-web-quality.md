# Faz 10.1 — Web kalitesi ve istemci dayanıklılığı

> **20 Kasım tekrar incelemesi:** [QA raporu](phase-10-review.md).
> Menü/listbox rolleri, geri düğmesi adı, form/navigasyon/görsel açıklaması
> kontrastı ve açık listenin KDV alanını örtmesi düzeltildi. Son owned fixture
> `axon-dr-a0957a1d791e`: **20/20 PASS**, skip/retry/flaky=0, cleanup=0.
> Chromium LCP596 / INP120 ms, CLS0,0567075. Önceki INP216 ms FAIL ve diğer
> başarısız koşular raporda korunur; bu değişkenliğin kesin nedeni çözülmüş
> sayılmaz. Yük altında headroom, field p75 ve manuel erişilebilirlik kapıları
> açık; CONDITIONAL PASS kararı devam eder. Uzun oturum yeniden ölçülmedi.

19–20 Kasım 2026. **Karar: CONDITIONAL PASS.** Yerel browser ve oturum kontrolleri
başarılıdır; field CWV, manuel erişilebilirlik ve yük altında ek browser kabulü
açık kapıdır. Bu rapor WCAG sertifikası veya production kapasitesi beyanı değildir.
Bu karar Faz 10'dan bağımsızdır: son backend yük ölçümleri kullanıcı isteğiyle
durduruldu; Faz 10 performans kabulü FAIL ve güvenilir kapasite belirlenemedi.
Buradaki browser sonuçları bu eksik kapasite kanıtının yerine geçmez.

## Mimari inceleme ve giderilen sorunlar

Next App Router, auth/bootstrap, React Query cache, Zustand store'ları, Axios
interceptor'ları, realtime hook'u, ana liste ve finansal formlar incelendi.
Tenant ID'yi tek başına karşılaştırmak A→B→A veya aynı kullanıcıyla yeniden giriş
yarışını ayırmıyordu; geç gelen 401 yeni oturumu kapatabiliyor, component/form
state'i cache temizlense de yaşayabiliyordu. Finansal formun yeniden mount olması
timeout sonrası yeni idempotency key üretip sonucu belirsiz işlemi tekrar
oluşturma riski taşıyordu. Liste hataları empty/izin/loading durumlarıyla
karışabiliyor; label, dialog, menü focus ve küçük tıklama hedefleri eksikti.

## Değişiklikler ve dosyalar

| Alan | Dosyalar / gerekçe |
|---|---|
| Oturum sınırı | `src/lib/http/{tenant-session,session-boundary}.ts`, `store/auth.store.ts`, `bootstrap/providers/AppProviders.tsx`: monoton revision, request generation, cache/store/form reset |
| HTTP hatası | `lib/api-client.ts`, `lib/http/api-error.interceptor.ts`, `types/api.types.ts`: Zod ile legacy error parse, timeout/network ayrımı, stale cevap/401 iptali |
| Mutation güvenliği | `lib/http/{mutation-intent,protected-mutation}.ts`, `services/{accounting,stock,purchase}.service.ts`: ödeme, manuel stok ve mal kabul için payload/oturum bağlı intent |
| Realtime | `features/chat/model/{realtime-session,use-chat}.ts`: synchronous eski socket kapanışı, bounded reconnect/heartbeat, tenant frame doğrulaması ve ACK |
| Liste durumları | `components/shared/{DataTable,ApiErrorState}.tsx`; products/contacts/sales invoice liste sayfaları: loading/empty/error/partial/permission/trial/retry ayrımı |
| Erişilebilir kontroller | `components/ui/{Input,Select,Combobox,Button}.tsx`, `shared/{RowActions,Sidebar}.tsx`, login/auth layout ve `features/accounting/PaymentsListPage.tsx`: label/ARIA, klavye, focus, gerçek modal button, contrast/hedef boyutu |
| Hata / ölçüm | `app/{error,global-error,layout}.tsx`, `components/telemetry/WebVitals.tsx`, `instrumentation.ts`: Next 16 retry contract'ı, generic safe boundary/log ve yerel vitals |
| Gerçek test | `tests/unit/{tenant-session-generation,session-boundary,mutation-intent,chat-realtime-session}.test.ts`, `tests/quality/`, `playwright.quality.config.ts`, `scripts/observability/{web-quality,virtual-browser}.ts` |

Yerleşim ve kompakt görsel tasarım korunur. Erişilebilirlik için gerekli semantik,
contrast, target ve focus değişiklikleri yapıldı; yeni dekoratif redesign yoktur.

## Tenant, cache ve WebSocket sözleşmesi

Kimlik değişimi user/tenant/sessionVersion üzerinden monoton revision üretir.
Provider aynı render batch'indeki A→B→A değişimini de görür; Query cache, toast ve
palette state'i temizlenir, subtree key'i form/component state'ini sıfırlar.
Revision isteğe dispatch öncesinde bağlanır. Eski cevap yeni cache'e yazılmaz;
eski 401 yeni oturumu logout etmez. Crypto digest sırasında oturum değişirse
kritik mutation transport'a hiç gönderilmez. Refresh/me aynı kimlikte kaldığında
gereksiz reset yapılmaz. JWT localStorage'a persist edilmez; eski storage temizliği
engellenirse uygulama diagnostic istisnasıyla çökmez.

Realtime binder auth revision değişince eski socket'i senkron kapatır; eski
mesaj/timer/reconnect callback'leri yeni oturuma yazamaz. Reconnect 1.5–30 s bounded
backoff, heartbeat ve auth close code'larında durma vardır. ACK yalnız doğrulanmış
tenant frame'i state'e uygulandıktan sonra gönderilir. Bu uygulama refresh
token/socket protokolünü veya server tenant yetkilendirmesini gevşetmez.

Browser fixture'ı gerçek HttpOnly cookie ile A→B→A yeniden yüklemeyi test eder.
Uygulamada mevcut olmayan bir SPA tenant selector'ü varmış gibi gösterilmez;
aynı batch/store/network yarışları doğrudan gerçek store/interceptor unit
testleriyle ayrıca sınanır.

## Tekrar gönderim politikası

Intent registry sessionStorage'da yalnız SHA-256 identity/endpoint namespace'i,
canonical payload hash'i ve random UUID saklar. Finansal içerik, kişi bilgisi veya
token saklanmaz. Namespace başına tek aktif işlem, en fazla 32 çözülmemiş intent
ve payload boyut sınırı vardır. Storage bozuk/kapalıysa güvenli tekrar gönderim
sağlanamadığından fail-closed davranır.

| Durum | Davranış |
|---|---|
| Aynı formda çift tıklama | Tek aktif dispatch; ikinci istek bağımsız bir finansal etki oluşturmaz |
| DB commit sonrası yanıt kaybı / network / 5xx | Intent korunur; aynı payload ve oturumla reload sonrası aynı key kullanılır |
| Remount yeni yerel key üretir | Saklanan intent'in key'i önceliklidir; hash idempotencyKey alanını dışlar |
| Önceki sonuç belirsizken payload değişir | Yeni mutation engellenir; önce gerçek kayıt/replay ile mutabakat gerekir |
| Kesin validation / auth / izin / plan reddi | Sonuç koduna göre intent bırakılır; kör global mutation retry yoktur |
| Tenant/oturum dispatch sırasında değişir | HTTP gönderilmez; eski sonuç yeni oturuma uygulanmaz |

Ödeme, manuel stok hareketi ve purchase receipt endpoint'leri mevcut backend
idempotency sözleşmesini kullanır. Invoice approval'ın mevcut explicit key'i
korunur. SessionStorage browser/tab ömrü ve aynı origin ile sınırlıdır; bütün
cihazlar/sekme kopyaları için evrensel once-only garantisi değildir. Belirsiz
işlemi silip yeni key üretmeye yarayan güvensiz bir UI butonu eklenmedi. Operatör
kayıt, kasa/cari/stok ve audit üzerinden sonucu uzlaştırmalıdır.

## Liste durumları ve erişilebilirlik

Permission/auth/trial hatası cached tabloyu gizler. Geçici refetch hatasında eski
yetkili veri açık bir partial-data uyarısıyla gösterilir; hata "kayıt yok"
olarak sunulmaz. Retry gerçek API'den yeniden okur. Tablo caption/th scope,
loading status/busy, klavye satır davranışı; input/select error alert/description,
combobox/listbox aktif seçim ve ok/Enter/Escape/Tab; menü açılış focus'u ve Escape
geri dönüşü düzenlendi. Modal açıcı link yerine button'dur. Login contrast ve
password toggle/favorite target boyutları iyileştirildi.

Automated axe kuralları WCAG 2 A/AA, 2.1 AA ve 2.2 AA tag'larıyla gerçek login ve
authenticated ürün tablosunda koşar. Gerçek ödeme dialog'unda Tab trap ve Escape
sonrası opener focus'u, row action menüsü ve login klavyesi ayrıca test edilir.
Bu sınırlı ekran taraması bütün ERP'nin WCAG sertifikası değildir. NVDA/JAWS/VoiceOver,
zoom/reflow, mobil dokunmatik, yüksek contrast ve büyük sanallaştırılmış listeler
için manuel pilot kabulü açık kapıdır. 24 CSS px target kuralı ve istisnaları
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), combobox etkileşimi
[WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) ile değerlendirilir.

## Performans ve geçerli ölçüm şartları

Production Next standalone image gerçek Caddy/API/PostgreSQL/Redis ile açılır;
dev server kullanılmaz. Web 1 CPU/768 MiB, API 2 CPU/1 GiB; measurement client
ayrı kaynak tüketir. Bundle artifact'ları gerçek encoded/transferred JS byte,
DOM node ve navigation sürelerini kaydeder; cache hit transferi sıfır olabilir,
dosya yokmuş gibi yorumlanmaz. Hydration/pageerror kontrolleri gerçek sayfalardadır.

WebVitals callback'i yalnız name/value/rating yerel event'i yayınlar; URL,
navigation ID, DOM entry, identity/cookie veya dış analytics aktarımı yoktur.
Chromium laboratuvar kontrolü gerçek LCP ≤2500 ms, CLS ≤0.1, INP ≤200 ms ölçümünü
ister. Eksik metric sıfır/başarı sayılmaz. Windows headless tarayıcı sekmeleri
sürekli görünür tuttuğundan CLS/INP finalizasyonu geçersizdi; bu koşular saklanır.
Normal quality runner gerçek görünürlük geçişini, host ekranı açmadan, digest ile
sabitlenmiş Playwright Linux image'ında Xvfb ile gerçekleştirir. Firefox yalnız
motorun gerçekten desteklediği vitals'ı raporlar.

25 dakikalık Chromium/CDP uzun oturum testi gerçek SPA contacts/products
gezinmesi ve düzenli tenant değişimleriyle post-GC heap/DOM trendini kaydeder;
büyüme <48 MiB, azami heap <200 MiB ve sıfır API 5xx/pageerror ister. Bu bütçeler
laboratuvar leak guard'ıdır; bütün leak sınıflarını veya kullanıcı filolarını
kanıtlamaz. Field p75, mobil/masaüstü ayrımı ve gerçek kullanıcı ölçümü ayrıca
gerekir; [Core Web Vitals eşikleri](https://web.dev/articles/defining-core-web-vitals-thresholds)
ile bir headless numune aynı kanıt değildir.

## Test sonucu ve karar

`artifacts/disaster-recovery/axon-dr-b5126186bfe8/`: **18/18 PASS**, 0 skip,
0 retry/flaky; Chromium ve Firefox. Gerçek empty/loading/permission/trial/partial,
network retry, A→B→A, ödeme double-submit + commit yanıt kaybı/reload/replay,
modal/keyboard ve axe kontrolleri dahildir. Final JSON cleanupFailures=0'dır.

| Ölçüm | Gerçek yerel sonuç |
|---|---|
| Chromium LCP / INP / CLS | 692 ms / 128 ms / 0,0567075; 2500 / 200 / 0,1 eşikleri değişmedi |
| Chromium en yavaş kaydedilen interaction | 128 ms: input delay 5,1–9,5 ms, handler 0,3–2,9 ms, presentation 115,6–121,1 ms |
| Firefox desteklenen LCP örnekleri | 738–1806 ms; olmayan CLS/INP değeri sıfır olarak uydurulmadı |
| Her motorda en büyük encoded JS toplamı | 354213 byte; network transfer/cache bilgileri ayrı kaydedildi |
| Uzun oturum | `axon-dr-f684d89e63f1`: 1500,037 saniye, 143 döngü / 286 SPA yön değişimi, düzenli tenant-cookie değişimi ve reload |
| GC sonrası heap | 11285164 → 11339132 byte; fark 53968 byte; 48 MiB büyüme / 200 MiB azami bütçeleri PASS |
| Uzun oturum hatası / cleanup | API 5xx=0, pageerror=0; 1/1 test PASS ve cleanupFailures=0 |

Okunabilir sayısal artifact'lar ilgili owner klasöründe
`quality-chromium-production-navigation.json`,
`quality-firefox-production-navigation.json` ve
`quality-chromium-long-session-memory.json`; ham Playwright JSON/JUnit de korunur.
Uzun oturum tenant-cookie geçişlerinde tam reload yapar; tek bir JS context'inin
kesintisiz 25 dakikalık SPA ömrü veya bütün leak türleri kanıtlanmış sayılmaz.

Başarısız koşular gizlenmedi. Native headless ölçümü CLS/INP finalizasyonu
üretemedi; ayrı CDP session'ında focus kapatmak Playwright'ın kendi session'ındaki
override'ı kaldırmadı. Sanal ekran ve default context'e `noDefaults:true` ile
bağlanan ayrı Chromium gerçek `hidden` durumunu sağlar. İlk read-only sanal
browser'daki crashpad config sorunu yalnız geçici XDG dizinleriyle düzeltildi.
Empty testinin tüm `role=alert` öğelerini hata sayması Next route announcer'ını
da kapsıyordu; artık gerçek empty state ve retry aksiyonunun yokluğu kontrol edilir.

`axon-dr-3203763f62da` koşusunda INP **304 ms: FAIL**. Aynı sırada kapsamlı DR
regresyonu çalışıyordu. Ağır regresyon bitince aynı eşiklerle tekrar koşu 128 ms
verdi. İlk örneğin interaction attribution'ı yoktu; 304 ms'nin kesin kök nedeni
kanıtlanmış veya bir ürün optimizasyonuyla giderilmiş gibi sunulmaz. Yeni probe
input/processing/presentation ayrımını kaydeder. Yük altında browser headroom ve
gerçek kullanıcı field p75 ölçümü pilot öncesi açık kabul kapısıdır. Host/Docker
kesintisiyle tamamlanmayan eski uzun koşu da PASS sayılmadı.
