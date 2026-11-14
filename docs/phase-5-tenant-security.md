# Faz 5 — Tenant ve araç erişimi güvenliği

14 Kasım 2026 tekrar inceleme sonucu: 14 dosyada **55/55** HTTP/PostgreSQL/Node transport testi (tenant/araç matrisi 11/11 ve session regresyonları 4/4), backend **165/165**, web **63/63**, mobil **119/119** birim testi; backend, web ve mobil tip kontrolleri; backend/web üretim derlemeleri başarılı. Module-boundary, statik tenant isolation ve security hardening kontrolleri tekrar başarılı. Önceki ESLint, runtime tenant guard, permission gating ve API contract smoke kontrolleri de başarılıydı. Kullanıcının devam onayıyla dış npm advisory sorgusu tamamlandı; kalan bulgular aşağıda açıkça kaydedilmiştir.

## Uygulanan sözleşmeler

- HTTP tenant kimliği doğrulanmış token veya doğrulanmış destek oturumundan gelir. Body/query/header tenant alanları bu kimliği değiştirmez. Mevcut 129-model runtime guard ve statik izolasyon kontrolü korunur. Üretim güncellemesinin `where` koşuluna açık tenant filtresi eklenmiştir.
- Güvenlik oturumu token'daki tenant **ve kullanıcıyla** eşleşir; başka kullanıcının aktif session ID'si kabul edilmez. Mevcut eski-token uyumluluğu korunur; yeni login oturumları ve revoke testi gerçek session kayıtlarıyla doğrulanır.
- Oturum kayıtlarının create/touch/revoke işlemleri tenant başına PostgreSQL transaction advisory lock ile sıralanır; kilitten sonra güncel kayıt tekrar okunur. Böylece eşzamanlı giriş kayıtları kaybolmaz ve eski bir touch isteği iptal edilmiş oturumu yeniden aktifleştiremez. Session limiti yeni oluşturulan oturumu koruyarak eski oturumları iptal eder. Create/revoke ve zorunlu audit aynı transaction içindedir; tekrar revoke ikinci audit üretmez. Oturum listeleme yalnız okur.
- Platform admin token/cookie ve doğrulanmamış destek header'ları tenant yetkisi vermez. Destek oturumu akışı kendi mevcut doğrulama/yetki sözleşmesine tabidir.
- AI tool discovery ve execution aynı tipli `tool-access.policy.ts` politikasını kullanır. Modülsüz finans araçları kaldırılmıştır. Araç birden fazla veri alanı okuyorsa ek READ izinleri de gerekir. Bilinmeyen plan/araç ve boş aktif modül listesi erişim sağlamaz.
- Her tool execution'da üyelik, plan, modül ve rol izinleri DB'den yeniden çözülür; önceki model turundaki rol snapshot'ına güvenilmez. Satın alma yazma aracı güncel PURCHASING feature override'ını ve deneme bitişini de kontrol eder. Execution kendi tenant scope'unu kurar. Model argümanındaki tenant/user/permission alanları otorite değildir. Başarılı/engellenen çağrılar model argümanlarını audit'e kopyalamadan kullanıcı/tenant/tool/turn bilgisiyle izlenir.
- Yazma allowlist'indeki düşük stok satın alma aracı yalnız DRAFT talep oluşturur; gerçek kullanıcı `createdById` olarak kaydedilir. Modelin `confirmed=true` değeri tek başına onay değildir. Önceki **farklı turdaki** aynı seçeneklerin önizlemesi, sunucunun gerçek kullanıcı metninden doğruladığı kısa açık onay, aynı tenant/session ve beş dakikalık süre gerekir. Onay bir kez tüketilir. Süreç belleği kaybolursa yeniden önizleme gerekir; kalıcı/sınırsız onay yoktur.
- Satın alma onayı seçeneklere ek olarak gerçek önizlemenin ürün/fiyat/stok/miktar içeriğinin hash'ine bağlıdır. Fiyat veya stok değişirse eski onayla yazılmaz; yeni önizleme ve ayrı kullanıcı onayı gerekir. Yazma servisindeki ikinci kontrol, executor kontrolünden sonra değişen önizlemeyi de reddeder; taslak doğrulanan satır değerlerinden oluşturulur.
- Model çıktıları, provider/tool sonuçları, kayıt adları ve doküman metinleri veri olarak ele alınır. Prompt'a da bu kural eklenmiştir; yetki ve onay kontrolü sunucu kodundadır. Toplu silme/fatura iptali/ödeme/muhasebeleştirme/yetki değiştirme araçları bu tool allowlist'inde bulunmaz; model bunları yeni isim veya enjekte talimatla çalıştıramaz.
- AI konuşma anahtarı tenant+kullanıcı yanında plan/modül/izin kapsamının hash'ini içerir. Eski rol kapsamındaki gecikmiş cevap yeni kapsama yazılamaz. Kullanıcının geçmiş temizliği tüm kapsamlarını temizler. Mevcut süre/bellek sınırları korunur.
- Özel belge ve sohbet dosyası URL uçları doğrudan nesne depolama bearer URL'si vermez. Mevcut sözleşmenin API fallback'ini döndürür; her indirme güncel tenant/kullanıcı/gizlilik/sohbet üyeliği kontrolünden geçer. Belge yanıtında `direct:false` korunur. Dosya aktarımı backend üzerinden geçtiğinden bu trafik backend kapasitesine dahildir. Upload imzalama sözleşmesi değişmez.
- Web cache'i tenant veya kullanıcı değişince temizlenir. Axios request'leri oturum nesliyle eşleştirilir; eski başarılı yanıtlar ve eski 401 hataları, payload `tenantId` içermese veya kullanıcı A→B→A dönse bile yeni oturuma uygulanmaz. Eski 401, yeni kullanıcıyı logout ettirecek error handler'a ulaşmaz.
- Yetkisiz API yanıtları HttpOnly oturum cookie'sini silmez; gecikmiş bir 401'in tarayıcıda yeni giriş cookie'sini silmesi önlenir. Geçersiz/iptal edilmiş token yine 401 alır. Açık logout endpoint'i cookie temizliğini sürdürür; geçersiz cookie ile giriş sayfasına dönüş mevcut yönlendirme sözleşmesinde desteklenir.

## Kanıt matrisi

`tests/cross-module/scenarios/security-boundaries.test.ts`, gerçek HTTP uygulaması ve izole PostgreSQL kullanır. Her yabancı-ID okuma kontrolünün yanında kaydın sahibiyle başarılı erişim kontrolü vardır; olmayan route'un 404'ü izolasyon kanıtı sayılmaz.

| Alan | Yerel kanıt |
|---|---|
| Cari, fatura, ödeme | Yabancı ID reddi; forged tenant header/body/query; list/pagination izolasyonu; yabancı cariyle fatura oluşmaması; cari overwrite sonrası DB değişmemesi |
| Ürün, depo, stok | Yabancı ürün/depo ID; ürün liste izolasyonu; önceki cross-module stok tüketimi/rezervasyon/foreign-product rollback kontrolleri |
| İK ve bordro | Yabancı employee/payroll ID; kendi tenant'ında başarılı detay ve liste, diğer tenant listesinde bulunmama |
| Belgeler | Yabancı download/signed-url/access-log reddi; sahibinin aldığı API indirme URL'siyle başka tenant erişiminin reddi |
| Sohbet | Yabancı konuşma ve dosya; aynı tenant'ta üye olmayan kullanıcı ve başka uploader'ın özel dosyası; dosya URL'si ve indirme kontrolü |
| Raporlar | Başka tenant'ta tutarlı finans fixture'ı varken query tenant enjeksiyonuna rağmen kendi tenant aggregate'inin sıfır kalması |
| Platform realm | Admin JWT/cookie ve sahte support header ile tenant endpoint'ine erişilememe |
| Session/API key/rol | Token kullanıcısıyla session sahibi uyuşmazlığı; mevcut platform senaryolarında revoke, scope, rol grant/revoke sonrası aynı token'la anlık değişim |
| Session yarışları | Üç eşzamanlı giriş ve limit=1; gerçek DB trigger/advisory bariyeriyle touch/revoke yarışı; tekrar revoke audit sayısı; SQL query kaydıyla salt okunur listeleme |
| AI araçları | Gerçek DB rol grant/revoke; injected tenant argümanının etkisizliği; olmayan yüksek etkili tool reddi; model onay iddiasıyla yazılamaması ve gerçek ayrı tur onayıyla tek DRAFT talep |
| Satın alma önizlemesi | Önizlemeden sonra fiyat ve stok değişiminde eski onayla talep oluşmaması; yeni onayla güncel miktar/fiyat ve doğru kullanıcıya ait DRAFT oluşması |
| CSRF/upload | Cookie yazımında yabancı Origin reddi ve izinli Origin başarısı; HTML MIME ve body tenant/storageKey enjeksiyonunun rezervasyondan önce reddi |
| Web oturumu | Gerçek Axios adapter'ı ile gecikmiş başarı/401, payload'da tenant olmaması ve A→B→A; değişmeyen kimliğin başarılı yanıtı |
| HttpOnly cookie | Geçersiz veya iptal edilmiş cookie ile 401 yanıtında Set-Cookie olmaması; aynı iptal edilmiş cookie ile açık logout'un cookie'yi temizlemesi |

Ek birim testleri, bilinmeyen plan/boş modül, finansal/composite tool izinleri, tek kullanımlık/süreli/aynı seçeneklere bağlı onay, prompt/tool-output enjeksiyonunun onay sayılamaması ve rol kapsamına göre geçmiş izolasyonunu doğrular.

## Çalıştırma ve sınırlar

```powershell
$env:CROSS_MODULE_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/phase3_local_ci?schema=public'
npm.cmd run test:cross-module
npm.cmd --workspace=@repo/backend run test:unit
npm.cmd --workspace=web run typecheck
npm.cmd --workspace=web run test:unit
npm.cmd --workspace=@repo/backend run test:tenant-runtime
npm.cmd --workspace=@repo/backend run test:tenant-isolation
npm.cmd --workspace=@repo/backend run test:permission-gating
npm.cmd --workspace=@repo/backend run test:security-hardening
npm.cmd run test:module-boundaries
```

Yeni senaryolar mevcut zorunlu CI cross-module job'ının glob'una dahildir; birim testleri de mevcut unit job'larında yer alır. JSON/JUnit kanıtı `artifacts/cross-module/` altındadır. Yeni migration yoktur; gerçek/development DB kullanılmamıştır. Yeni kod explicit `any` veya type bypass içermez.

Depoda ayrı bir MCP protokol sunucusu bulunmadığından hayali bir MCP endpoint'i eklenmemiştir; mevcut AI tool executor güvenlik sınırı güçlendirilmiştir. Agent-command planner'ın plan/audit durumları gerçek finansal mutation veya yeni tool yetkisi olarak sunulmaz. Canlı model sağlayıcısı/S3, hosted CI, gerçek tarayıcı tenant-switch oturumu ve kapsamlı sızma testi bu yerel sonuçların parçası değildir. Önceden verilmiş dış depolama URL'leri kendi süreleri dolana kadar geçerli olabilir; yeni özel indirme URL'leri API üzerinden doğrulanır.

## Bağımlılık taraması ve kalan bulgular

İlk sorgu otomatik incelemede durdurulduktan sonra kullanıcı devam edilmesini istedi; npm advisory servisine gerçek sorgu yapıldı. `npm audit --omit=dev` sonuçları:

| Kapsam | Kritik | Yüksek | Orta | Düşük | Toplam |
|---|---:|---:|---:|---:|---:|
| Monorepo — güncelleme öncesi | 0 | 12 | 17 | 1 | 30 |
| Monorepo — güncelleme sonrası | 0 | 5 | 16 | 1 | 22 |
| Backend workspace — sonrası | 0 | 3 | 1 | 0 | 4 |
| Web workspace — sonrası | 0 | 0 | 2 | 0 | 2 |

Mevcut semver aralıkları içinde Hono 4.13.18, Node adaptörü 1.19.19, Zod 4.6.7, follow-redirects 1.16.3, node-forge 1.4.3, Undici 6.29.1 ve React Navigation core/router 7.24.0/7.6.5 kilitlendi. Backend/web/mobil/shared-types Zod alt sınırları ve backend Hono/adaptör alt sınırları yükseltildi. Query-string/decode-uri-component eski bağımlılık zinciri kaldırıldı. `npm audit fix --force` kullanılmadı. Hono router/middleware ve Zod koleksiyon doğrulama bulguları artık raporlanmıyor.

Yeni transport testi gerçek `@hono/node-server` TCP sunucusunda `/health` başarısını, üç özel endpoint'in 401 dönmesini ve encoded private path'lerin veri döndürmemesini doğrular. İn-process Hono testlerinin yanında gerçek adaptör davranışı da kontrol edilir.

Kalan uyarılar çözülmüş veya kullanıcı tarafından kabul edilmiş sayılmaz:

- **Backend yüksek üç kayıt:** Prisma 6.19.3 → `@prisma/config` → deepmerge-ts 7.1.5 aynı zincirdir. Sorgunun önerdiği üst paket düzeltmesi Prisma 7.10.1 büyük sürümüdür. Uygulamanın HTTP kaynaklarında bu config/merge paketleri import edilmez; CLI/config kullanım yolu değerlendirilmiştir. Bu, advisory kaydını kapatmaz. Prisma 7 config/client/driver uyarlaması ayrı uyumluluk çalışması gerektirir; transitive major zorlanmamıştır.
- **Mobil araç zincirinde iki yüksek kayıt:** Metro → image-size 1.2.1 ve Expo Metro config → PostCSS 8.4.49. Web'in PostCSS örnekleri 8.5.23/8.5.28'dir; bu iki kayıt mobil derleme zincirindedir. Image-size major/API ve Expo'nun pinlediği PostCSS sürümü, SDK/bundle uyumluluğu doğrulanmadan zorlanmamıştır.
- **Backend orta:** Node adaptörünün kullanılmayan `serveStatic` helper'ındaki çift decoding kaydı kalır. Backend kaynakları `serveStatic` import/çağrısı içermez. Adaptör 2.x'e geçiş, mevcut `@hono/node-ws` 1.x peer sözleşmesiyle birlikte ele alınmalıdır; peer dependency atlanmamıştır.
- **Web orta iki kayıt:** ExcelJS → uuid zinciri. Advisory, buffer verilen v3/v5/v6 kullanımını kapsar; incelenen ExcelJS xlsx kullanımı v4'tür. npm'nin önerdiği ExcelJS 3.x downgrade'ı veya uuid major override'ı uygulanmamıştır; kayıtlar açık kalır.
- **Diğer orta/düşük:** Expo SDK 54'ün config/glob/minimatch/xcode/uuid/deepmerge zincirleri. Audit'in Expo 58 önerisi, mevcut native SDK sürüm geçişi olarak ayrıca doğrulanmalıdır.

Ham raporlar: `artifacts/phase5-npm-audit.json`, `phase5-npm-audit-after.json`, `phase5-backend-audit.json`, `phase5-web-audit.json`. Güncel bağımlılıklar ve tekrar inceleme düzeltmeleri üzerinde 55 cross-module, 347 birim testi ve backend/web build sonuçları yeniden alınmıştır. Tam entegrasyon çalışması 222,49 saniyede, sıfır çıkış koduyla tamamlanmıştır; son kanıt `artifacts/phase5-final-review-cross-module.log` ve `artifacts/cross-module/` altındadır. Advisory taraması **temiz değildir**; yerel test başarısı kalan kayıtların kapandığı anlamına gelmez. Depo genelindeki önceki kalite borcu da bu fazda kapanmış sayılmaz.
