# Faz 10 tekrar incelemesi — 20 Kasım 2026

Bu inceleme Faz 10'un backend, web, operasyon araçları ve veri yönetişimi
değişikliklerini kapsar. Karşılaştırma tabanı Faz 9 sonundaki `9638598`, devam
edilen güncel commit `72fb9df` ve aşağıdaki çalışma ağacı düzeltmeleridir.
Kullanıcının ilgisiz mobil plan dosyaları değiştirilmedi.

## Bulunan ve düzeltilen hatalar

| Sorun | Kök neden ve düzeltme | Doğrulama |
|---|---|---|
| Provider isteğinde eski Authorization başlığı | `Request` ve `init.headers` birleştiriliyordu. Native fetch davranışına uygun olarak açıkça verilen başlık kümesi önceki kümeyi tamamen değiştirir; boş küme de desteklenir. | Eski Authorization'ın kaldırılması ve override verilmediğinde korunması için iki regresyon testi. |
| Reader-first şifreleme geçişinde okunamayan yeni v1 kayıt | Yeni aktif anahtar hazırlanmış, eski anahtar `legacy` altında tutulmuş ve v2 yazımı kapalıyken v1 yazma ve okuma farklı anahtar seçiyordu. v1 yazma, v1 okuyucunun seçtiği anahtarı kullanır; v2 aktif anahtarla devam eder. | Eski ve geçiş sırasında yeni üretilen v1 ciphertext birlikte açılır; v2/escrow regresyonları korunur. Gerçek anahtar veya müşteri kaydı değiştirilmedi. |
| Süresi dolmuş WebSocket tesliminin onaylanması | ACK ile periyodik sweep arasındaki aralıkta deadline kontrol edilmiyordu. ACK işlenirken de kesin deadline uygulanır; geciken teslim unconfirmed/unknown sayılır, confirmed sayılmaz. | Sweep çalıştırılmadan deadline'a gelen ACK ve sonradan sweep ile çift sayımın engellenmesi. |
| Başarısız outbox tüketicisinin başarılı trace üretmesi | Tüketici hatası durable retry durumuna çevrilip `false` döndürülüyordu; exception görmeyen span başarılı kapanıyordu. Güvenli sabit `error.type` ile ERROR span kaydedilir. | Gerçek PostgreSQL, HTTP mail provider ve OTLP collector ile FAILED/nextRetryAt, başarısız tüketici receipt'inin yokluğu ve ERROR span birlikte denetlenir. Retry/delivery protokolü değiştirilmedi. |
| HTTP 500 için iç application span'inin başarılı görünmesi | Son route/status, `application.request` span'i kapandıktan sonra atanıyordu. Final ölçümler span'in kendi `finally` bloğuna taşındı. | Gerçek Hono middleware ve OTLP collector üzerinden hem 500 hem 200 yanıtında HTTP/application span route, status ve hata kodu eşleşir; gerçek URL parametresi trace'e girmez. |
| Web menü ve combobox semantiğinin kaybolması | Güncel commitlerde `menu/menuitem` ve `listbox/option` rolleri kaldırılmıştı; mevcut menü testiyle de çelişiyordu. Rol/selected ilişkileri geri getirildi; mevcut klavye davranışı korundu. | İki tarayıcıda açık menüde focus/ok tuşu/Escape, açık menü axe kontrolü; ürün kategorisinde option, active-descendant, Enter/Escape ve açık combobox axe kontrolü. Yeni kayıt oluşturulmaz. |
| Ürün formunda ve ortak navigasyonda erişilebilirlik hataları | Yeni açık-combobox taraması isimsiz geri düğmesi ile düşük kontrastlı metinleri ortaya çıkardı. Geri düğmesi adlandırıldı; ürün formu, combobox, sidebar, üst arama ve görsel yükleme açıklamalarının kontrastı artırıldı. İş akışı ve form doğrulaması değiştirilmedi. | Yeni test tam sayfada çalışır; axe kuralı, hedef kapsamı veya WCAG eşikleri gevşetilmedi. |
| Açık kategori listesinin komşu dokunma hedefini örtmesi | Absolute konumlanan seçenekler KDV alanını kısmen örtüyordu. Seçenek listesi belge akışına alındı; sonraki form satırı aşağı kayar ve tıklanabilir kalır. | Firefox'taki gerçek `target-size` ihlalinden sonra düzeltildi. Yeni test, liste açıkken KDV alanının `click({ trial: true })` ile erişilebilirliğini de denetler. |

İlk üç hatanın eski kodla kırılan testleri
`artifacts/phase10-review/reproduced-bugs.log` içinde korunur: **7 PASS / 3 FAIL**;
düzeltme sonrası aynı dosyalar **10/10 PASS** (`fixed-bugs.log`).
`axon-dr-5274f1404fbd` izole koşusunda yeni HTTP span testi eski kodla gerçekten
**FAIL** verdi: 500 yanıtında span status **1**, beklenen ERROR **2**. Diğer
18 governance/observability testi geçti; cleanup tamamlandı. Bu sonuç sonraki
başarılı koşuyla değiştirilmedi.

İlk genişletilmiş tarayıcı koşusu `axon-dr-4084b2059a6e`: **18 PASS / 2 FAIL**.
İki motorda da yeni ürün-kategorisi testi `button-name` ve `color-contrast`
ihlallerini gösterdi. Diğer 18 test geçti; cleanupFailures=0. Ekran görüntüleri,
axe bulguları ve ham Playwright raporu aynı owner altında korunur. Kontrast ve
düğme adı düzeltmeleri bu gerçek başarısızlıktan sonra uygulandı.

İkinci tarayıcı koşusu `axon-dr-a99104e976dd`: **18 PASS / 2 FAIL**, cleanup=0.
Kontrast/isim kontrolleri düzeldi. Yeni iki başarısızlık: Chromium INP **216 ms >
200 ms** ve Firefox açık kategori altında KDV alanındaki `target-size` ihlali.
KDV örtüşmesi sonraki markup düzeltmesinin nedenidir. Chromium LCP **992 ms**,
CLS **0,0583748**, en büyük encoded JS **354204 byte** ölçüldü. Yavaş
pointerdown'ın input delay'i **58,4 ms**, handler'ı **1,6 ms**, presentation'ı
**156 ms** idi. Bu ayrım kayıtlıdır; kesin ürün/host/render kök nedeni
kanıtlanmadı. INP başarısızlığı sonraki koşu başarılı olsa da silinmez veya
erişilebilirlik düzeltmesiyle giderilmiş gibi sunulmaz.

Üçüncü koşu `axon-dr-19ed40c02d42`: **19 PASS / 1 FAIL**, cleanup=0. Firefox'ta
açık liste/KDV actionability ve target-size kontrolü geçti. Chromium'da bu kez
formun görünür alt bölümündeki `ImageUploadBox` açıklamalarının üç kontrast
ihlali yakalandı; bileşenin metin tonları da düzeltildi. Bu koşuda Chromium
INP **184 ms**, LCP **780 ms**, CLS **0,0567075** idi. INP'deki koşular arası
değişim kaydedilir; kesin performans kök nedeni çözülmüş sayılmaz.

İlk outbox trace denemesi `axon-dr-14ecd7739651` içinde yanlış status'u ayrıca
gösterdi; ancak aynı koşu sırasında Docker kesintisi ve connection-pool hataları
olduğu için toplam koşu geçerli regresyon sonucu sayılmaz. Docker tekrar
açıldıktan sonra yalnız o owner'ın label ile doğrulanan test kaynakları temizlendi;
başarısızlık kayıtları korundu (`interrupted-cleanup.json`).

## Kontrol kapsamı

HTTP hata/middleware, W3C bağlamı ve bounded exporter/log kuyruğu, Prisma gözlemi,
readiness deadline, worker/outbox/provider akışı, realtime ACK, metrics erişimi,
operasyonel salt okunur SQL ve DR collector; session/tenant revision, eski cevap ve
401 engellemesi, cache temizliği, mutation idempotency, erişilebilirlik; scoped
privacy/export/hold, audit digest ve şifreleme rotasyonu incelendi. Güncel
Dockerfile ve web bileşeni commitleri de kapsama alındı.

Bu incelemede migration, finans/stok iş kuralları, tenant izolasyonu veya kota
sınırı değiştirilmedi. Production ve mevcut geliştirme veritabanına erişilmedi.
Veritabanı ve tarayıcı denemeleri rastgele owner etiketli, yeni Docker fixture'ları
kullanır. Commit, push veya deployment yapılmadı. `a.md` ignore kapsamında kalır.

İnceleme düzeltmelerinin uygulama dosyaları:

- `apps/backend/src/lib/telemetry/observed-fetch.ts`
- `apps/backend/src/utils/encryption.ts`
- `apps/backend/src/modules/collaboration/chat/infrastructure/realtime/delivery-telemetry.ts`
- `apps/backend/src/services/domain-event-outbox-worker.service.ts`
- `apps/backend/src/bootstrap/http/middleware.ts`
- `apps/web/src/components/shared/{RowActions,Sidebar,GlobalSearch}.tsx`
- `apps/web/src/components/shared/ImageUploadBox.tsx`
- `apps/web/src/components/ui/Combobox.tsx`
- `apps/web/src/components/features/products/ProductFormPage.tsx`

Regresyonlar `observed-fetch.test.ts`, `encryption-rotation.test.ts`,
`realtime-delivery-telemetry.test.ts`, `observability-governance.test.ts`,
`trace-collector.ts` ve `tests/quality/resilience.spec.ts` içindedir. İlk
düzeltmeler devam edilirken güncel commitlere alınmıştı; bu dosya listesi yalnız
son unstaged diff'i değil bütün inceleme düzeltmelerini gösterir. Faz 10'un tüm
dosyalarının taban commit ile karşılaştırılan listesi
`artifacts/phase10-review/changed-files.json` içinde tutulur.

## Güncel doğrulama

| Kontrol | Sonuç ve kanıt |
|---|---|
| Workspace typecheck | PASS; types/scripts/backend/web/mobile. `final-typecheck.log`. Son middleware düzeltmesi için `post-fix-backend-types.log`; son web düzenlemesi ve Playwright test tipleri için `image-contrast-web-types.log` ayrıca PASS. |
| Unit | **443 PASS**: backend 240, web 84, mobile 119. `final-unit.log`; son backend 240 için `post-fix-backend-unit.log`, son web 84 için `image-contrast-web-unit.log` ayrıca PASS. |
| Gerçek PostgreSQL cross-module | **146/146 PASS**, 24 dosya, 0 retry/skip. `axon-dr-449d1b2b5362`; son HTTP/outbox span regresyonları ve toplam 19 governance/observability senaryosu dahil. Cleanup tamamlandı. |
| Gerçek PostgreSQL + Redis integration | **foundation / finance / operations PASS**, `axon-dr-c9e60c51f325`; migration ve katalog hazırlığı yalnız yeni owned fixture'da. Cleanup tamamlandı. |
| Mimari / güvenlik | PASS; module boundary, Prisma architecture, contracts, tenant isolation/runtime (130 model), security hardening ve permission gating. `post-fix-guards.log`. |
| Release / performans araçları / DR safety | Sırasıyla **21 / 19 / 10 PASS**; `release.log`, `performance-tools.log`, `dr-safety.log`. Bunlar araç/güvenlik testidir; yeni yük veya uzun restore tatbikatı değildir. |
| Types package layout | PASS; `types-layout.log`. |
| Lint | **0 hata, önceden bulunan 10 uyarı**. Backend `tsc --noEmit`, tüm web `target-size-web-lint.log`; son renk değişikliği için bileşen `image-contrast-lint.log` ayrıca PASS. Uyarılar kapatılmadı veya yeni hatalar başarı sayılmadı. |
| Production derlemeleri | Backend runner, migrator ve production Next web PASS. `build/images.json`; son web digest'i `build-web-fixed/images.json` içinde. Gerçek browser fixture'ı bu imaj digest'lerini kullanır. |
| Tip güvenliği / kullanılmayan kod | İlk 193 dosyalık kapsamın 153 TS/TSX/MTS dosyası AST ve compiler unused kontrolünden geçti: yeni/değişen satırlarda explicit `any`, `@ts-ignore`/`@ts-nocheck` ve unused bulgusu **0**. On assertion'ın tamamı `as const`; `source-review.json`. Son liste yerleşimi, trial-click assertion ve ImageUploadBox renk farkı yeni deklarasyon içermez. Kapsam son renk dosyasıyla 194 dosya / 154 TS oldu; son AST ve SHA-256 kaydı `source-syntax-final.json` içindedir. |
| Chromium / Firefox | **20/20 PASS**, 0 skip/retry/flaky. `axon-dr-a0957a1d791e`; son production web ile açık menü, açık kategori, KDV actionability, tam sayfa axe, ödeme/session/retry kontrolleri. Final JSON passed=true, cleanupFailures=0. |

Tabloda yalnız owner adı verilen DB/browser kanıtları
`artifacts/disaster-recovery/` altındadır; diğer dosyalar
`artifacts/phase10-review/` altındadır. Compiler scan, son liste yerleşimi ve
tek Playwright actionability assertion'ı ve ImageUploadBox renk değişikliğinden
önce tamamlandı. Bu son farklar yeni deklarasyon içermez; ayrıca güncel web
typecheck/lint/unit/AST kontrolleriyle doğrulanır. Bir testin ya da imaj
derlemesinin başarılı olması, kesintili eski bir
koşuyu sonradan başarılı yapmaz.

Son browser koşusunda Chromium LCP **596 ms**, INP **120 ms**, CLS
**0,0567075**, en büyük encoded JS **354204 byte**; Firefox desteklenen LCP
örnekleri **812–2291 ms**. Eşikler LCP 2500 ms / INP 200 ms / CLS 0,1 olarak
korundu. Firefox'un üretmediği CLS/INP ölçümü sıfır kabul edilmedi. Sonuç
`browser-summary-final.json` ve ham Playwright JSON/JUnit ile bağlıdır.

Son web digest'i `sha256:ad77f79a870d6d92a840cf35f2e9425ceb6087bb298376e95260fd05204ba210`,
backend digest'i `sha256:fd75e09a7e0cd9ddf1909fc502aed4c51222e17e776a1071f7d72188b54b9b9d`.
Backend sentetik development fixture, web production build olarak çalıştırıldı;
bu ayrım `phase10-web-environment.json` içinde açıktır.

**Yerel işlevsel regresyon incelemesi: PASS.** Bulunan kod ve erişilebilirlik
hatalarının düzeltmeleri doğrulandı. Önceki 216 ms INP başarısızlığı korunur;
son 120 ms numunesi, kesin bir performans kök nedeninin çözüldüğünü ya da yük
altında/gerçek kullanıcılarda eşiklerin sağlandığını kanıtlamaz. Web ve veri
yönetişimi alt fazlarının mevcut CONDITIONAL PASS koşulları devam eder.

Kapanış doğrulaması `artifacts/phase10-review/final-evidence.json` içindedir:
son AST kaydındaki 154 kaynak dosyasının SHA-256'ı doğrulandı; incelemenin sekiz
owner'ından kalan container/volume/network sayısı **0**. `a.md` hâlâ ignored ve
untracked durumdadır. `git diff --check` geçti. Uygulama kaynakları bu son
doğrulamadan sonra değiştirilmedi.

## Performans ve kabul sınırı

Kullanıcının önceki talebi korunarak 30 dakikalık yük/soak, 25 dakikalık browser
oturumu ve 900 saniyelik WAL incident tatbikatı yeniden başlatılmadı. Kısa işlevsel
regresyonların geçmesi kapasiteyi veya production kabulünü kanıtlamaz.

Faz 10 genel kararı **FAIL — performans kabulü geçmedi** olarak kalır. Önceki
75 VU write p95 **807 ms > 800 ms** ve queue age **38,151539 s > 30 s** ihlalleri,
eksik son soak ve güvenilir kapasitenin doğrulanmaması gizlenmedi. Bu incelemeden
yeni bir güvenilir kapasite sayısı üretilmez.

Diğer açık kapılar da korunur: native Prisma pool wait/occupancy, 5000 satır
üzerindeki platform audit checkpoint bütçesi, güncel kodla tek tamamlanmış
12-olaylık staging tatbikatı, gerçek dış alarm/ayrı host restore, field p75 ve
manuel erişilebilirlik; hukuki saklama kararı, bütün provider/backup kopyaları için
erasure, bağımsız restore tombstone registry ve production anahtar rollout'u.

Ana kabul kayıtları: [Observability](phase-10-observability.md),
[Web kalite](phase-10.1-web-quality.md),
[Veri yönetişimi](phase-10.2-data-governance.md).
