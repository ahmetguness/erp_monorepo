# CI/CD ve güvence standardı

`CI Assurance` workflow'u Faz 2'nin kanonik kapısıdır. Pull request akışı hızlı kontrolleri; `main` ve elle tetikleme tam tarayıcı regresyonunu da çalıştırır. Hosted workflow çalışana kadar durum **PENDING** kabul edilir.

## Kanonik komutlar

- `npm test`: typecheck, lint, guard'lar ve unit testler.
- `npm run test:full`: hızlı kapı, coverage, DB entegrasyonu, Chromium/Firefox smoke, tarayıcı regresyonu ve production build.
- `npm run build`: Prisma client, ortak tipler, backend ve web production build.
- `npm run test:e2e:smoke`: Chromium ve Firefox kritik akışları.
- `npm run test:e2e:regression`: tüm web regresyonu ve erişilebilirlik kontrolü.
- `npm run test:ci-infrastructure`: rapor runner'ının başarı, hata, timeout ve process başlatma hatası regresyonları.
- `npm --workspace=web run test:e2e:accessibility`: admin klavye, oturum ve MFA tarayıcı kontrolleri; CI'de ayrı zorunlu job.

## İzolasyon ve raporlama

Boş PostgreSQL'e yalnızca commit edilmiş migration'lar uygulanır; `db push` kullanılmaz. `foundation`, `finance` ve `operations` shard'ları benzersiz `CI_RUN_ID` fixture'ları üretir ve `finally` içinde temizler. Unit testleri JUnit; entegrasyon testleri JUnit ve JSON; Playwright JUnit, JSON, HTML ve hata artefaktları üretir.

Her entegrasyon job'ı migration sonrasında seed çalıştırır: feature gate'ler kanonik plan özelliklerini DB'den okur. Tarayıcı smoke ve regresyon job'larının da ayrı PostgreSQL servisi vardır. `browser-environment` composite action migration, seed, tamamlanmış onboarding fixture'ı ve gerçek API lifecycle'ını hazırlar; health yanıtı gelmeden test başlamaz. Onboarding hazırlama script'i yalnız `CI=true` ve `*_ci` veritabanına izin verir. Mevcut geliştirme veya production DB'sinde çalıştırılmaz.

UI spec'leri ortak `tests/e2e/fixtures/test.ts` girişini kullanır. Yalnız TCMB dış servis yanıtı sabitlenir; cari/fatura smoke işlemleri gerçek backend ve PostgreSQL üzerinden devam eder. TCMB hata senaryoları kendi route override'larını korur. Hazırlama script'i seed kullanıcı kimliklerini `artifacts/browser/initialized-users.json` içine yazar; tarayıcı bağlamı bu kullanıcıların ilk ziyaret turunu tamamlanmış olarak başlatır. Tarayıcının reload/gezinme sırasında iptal ettiği GET istekleri ağ arızası sayılmaz; diğer ağ hataları ve mutation hataları kontrol edilir.

Web/API adresleri aynı `localhost` hostunu kullanır; farklı portlar cookie oturumunu korur. Runner Next ve Playwright CLI konumlarını npm workspace çözümlemesiyle bulur; CI'de kendiliğinden mevcut sunucu kullanmaz. Harici sunucu kullanımı açık `ADMIN_E2E_BASE_URL` gerektirir ve erişilemiyorsa hata verir.

Entegrasyon JSON raporları shard, commit SHA, run ID, migration sürümü/sayısı, Node/platform ve fixture stratejisini içerir. Shard rapor dosyaları ayrı adlandırılır. Unit job'ı coverage eşiklerini de zorunlu çalıştırır ve coverage raporlarını saklar.

## Tedarik zinciri

Kurulum `npm ci` ile yapılır. Critical npm audit, high/critical container, yasak lisans ve secret bulguları kapıyı durdurur. Breaking yükseltme gerektiren high npm bulguları görünür tutulur. Lisans istisnası ancak `config/license-exceptions.json` içinde sürümü sabit `paket@versiyon`, PR sahibi ve gerekçesiyle eklenebilir. CycloneDX SBOM saklanır; Dependabot haftalık npm ve Actions PR'ları açar.

Lockfile'daki eksik `fast-equals`, `resize-observer-polyfill`, Expo font ve WASI bağımlılık kayıtları düzeltildi. Root geliştirme bağımlılıklarında `magicast@0.3.5` Prisma config'in optional peer'ini, `react-dom@19.1.0` hoisted Next.js'in root React 19.1 peer'ini karşılar; web workspace kendi React/React DOM 19.2.4 sürümünü korur. Lockfile üzerinden CycloneDX üretimi ayrıca yerelde doğrulanabilir: `npm sbom --package-lock-only --sbom-format=cyclonedx`.

## Branch protection

`main` üzerinde force-push/silme kapatılmalı; güncel branch ve en az bir onay zorunlu olmalıdır. Gerekli kontroller: `static-quality`, `unit`, üç integration shard'ı, `browser-smoke`, `accessibility`, `production-build`, `supply-chain`, `assurance-summary`. `browser-regression` main/manual akışında zorunludur. GitHub ayarları ayrıca etkinleştirilmeden branch protection uygulanmış sayılmaz.

## Flaky test ilkesi

Retry ile geçen test flaky kabul edilir. Sahip, takip kaydı ve son tarih olmadan skip/fixme yapılamaz. Aynı test iki CI koşusunda flaky olursa merge öncesi düzeltilir veya belgeli risk kabulü gerekir.

Mevcut Playwright ayarı CI'de iki retry ve tek worker kullanır; `failOnFlakyTests=false` olduğundan retry ile geçen test job'ı kendiliğinden başarısız yapmaz. Flaky kayıtları yukarıdaki ilkeye göre ayrıca değerlendirilir. Demo tenant'ını değiştiren spec'ler aynı job içinde eşzamanlı çalışmaz; ayrı job'lar aynı DB'yi paylaşmaz. Aşağıdaki yerel tekrar 0 retry ile yapılmıştır; workflow'un bu ayarları değiştirilmemiştir.

## 20 Kasım 2026 — erişilebilirlik sözleşmesi ve tarayıcı regresyonu

`7be2f06` için [44783405688 koşusunda](https://github.com/ahmetguness/erp_monorepo/actions/runs/44783405688)
smoke 14/16, tam regresyon 197/212 geçti. Smoke'taki iki hata aynı fatura
testinin Chromium ve Firefox örnekleriydi. `assurance-summary` tarayıcı
işlerinin başarısızlığını doğru biçimde yansıttı; bağımsız üçüncü bir uygulama
hatası değildi.

Faz 10 erişilebilirlik değişikliklerinden sonra eski E2E seçicilerinin 15 dosyada
güncellenmesi gerekti. Görsel `*` işareti `aria-hidden` olduğundan bir alanın
erişilebilir adı `Ad*` yerine `Ad` olur; zorunluluk ve form doğrulaması korunur.
Combobox satırları `option` rolüyle seçilir. `button` rolü aramak, görünen doğru
seçeneği bulamaz. Adları birbirinin alt dizisi olan `Ad` ve `Adres` alanlarında
`exact: true` kullanılır. İşlem düğmeleri ve gerçek combobox seçenekleri aynı
seçiciyle ele alınmaz.

Fatura testinde ayrıca `İptal` metninin bulunması işlemin bittiğini kanıtlamıyordu:
`İptal et` düğmesi işlemden önce de görünür. Test şimdi doğru faturanın POST
cancel isteğinden 200 yanıtını, ekrandaki durum değişimini, ardından DB'deki
`CANCELLED` değerini ve iptal gerekçesini birlikte doğrular. İptal iş kuralı veya
DB sonucu değiştirilmedi.

Yerel tekrar, `NEXT_PUBLIC_API_URL=http://localhost:3001` ile production Next web,
gerçek API, kanonik demo seed ve yalnız yeni/owned PostgreSQL üzerinde yapıldı.
Smoke ve regresyon ayrı temiz fixture'lar kullanır; kişisel `.env` dosyaları bu
API fixture'ına yüklenmez. Yerel çalıştırma tek worker ve **0 retry** kullanır;
workflow, test süreleri, beklenen sonuçlar ve CI'deki retry ayarları değiştirilmez.

| Kontrol | Sonuç |
|---|---|
| Production web derlemesi | PASS |
| Web ve test typecheck | PASS; workspace TypeScript 6.0.3 |
| Değişen 15 spec lint / diff güvenliği | PASS; yeni any, type assertion, tip susturma veya skip/fixme yok |
| Chromium + Firefox smoke | 16/16 PASS |
| Smoke işinin sonraki cross-module adımı | 3/3 PASS |
| Tam Chromium regresyonu | Sonuç bekleniyor |

Kanıtlar `artifacts/ci-browser-review/` ve ilgili
`artifacts/disaster-recovery/axon-dr-*/` klasörlerinde JSON/JUnit, hata trace'leri
ve loglarla korunur. İlk yerel hedefli denemede fatura durumunun erken okunması
ve `Ad`/`Adres` seçici çakışması da yakalanıp düzeltildi; bu başarısızlık kayıtları
silinmedi. Bu kontrol, Faz 10'un ayrı `tests/quality` paketindeki 20 testin yerine
CI'ın `tests/e2e` paketini doğrular. Uzun yük testi veya kapasite kabulü değildir;
Faz 10 performans kapısı bu CI düzeltmesiyle PASS sayılmaz.
