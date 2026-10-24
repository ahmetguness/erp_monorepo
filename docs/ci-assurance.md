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

Playwright `failOnFlakyTests` CI'de açıktır: retry ile geçen test de job'ı başarısız yapar. CI tek worker kullanır; demo tenant'ını değiştiren spec'ler aynı job içinde eşzamanlı çalışmaz. Ayrı job'lar aynı DB'yi paylaşmaz.
