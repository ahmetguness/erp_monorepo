# CI/CD ve güvence standardı

`CI Assurance` workflow'u Faz 2'nin kanonik kapısıdır. Pull request akışı hızlı kontrolleri; `main` ve elle tetikleme tam tarayıcı regresyonunu da çalıştırır. Hosted workflow çalışana kadar durum **PENDING** kabul edilir.

## Kanonik komutlar

- `npm test`: typecheck, lint, guard'lar ve unit testler.
- `npm run test:full`: hızlı kapı, coverage, DB entegrasyonu, tarayıcı regresyonu ve production build.
- `npm run build`: Prisma client, ortak tipler, backend ve web production build.
- `npm run test:e2e:smoke`: Chromium ve Firefox kritik akışları.
- `npm run test:e2e:regression`: tüm web regresyonu ve erişilebilirlik kontrolü.

## İzolasyon ve raporlama

Boş PostgreSQL'e yalnızca commit edilmiş migration'lar uygulanır; `db push` kullanılmaz. `foundation`, `finance` ve `operations` shard'ları benzersiz `CI_RUN_ID` fixture'ları üretir ve `finally` içinde temizler. Unit testleri JUnit; entegrasyon testleri JUnit ve JSON; Playwright JUnit, JSON, HTML ve hata artefaktları üretir.

## Tedarik zinciri

Kurulum `npm ci` ile yapılır. Critical npm audit, high/critical container, yasak lisans ve secret bulguları kapıyı durdurur. Breaking yükseltme gerektiren high npm bulguları görünür tutulur. Lisans istisnası ancak `config/license-exceptions.json` içinde sürümü sabit `paket@versiyon`, PR sahibi ve gerekçesiyle eklenebilir. CycloneDX SBOM saklanır; Dependabot haftalık npm ve Actions PR'ları açar.

## Branch protection

`main` üzerinde force-push/silme kapatılmalı; güncel branch ve en az bir onay zorunlu olmalıdır. Gerekli kontroller: `static-quality`, `unit`, üç integration shard'ı, `browser-smoke`, `production-build`, `supply-chain`, `assurance-summary`. `browser-regression` main/manual akışında zorunludur. GitHub ayarları ayrıca etkinleştirilmeden branch protection uygulanmış sayılmaz.

## Flaky test ilkesi

Retry ile geçen test flaky kabul edilir. Sahip, takip kaydı ve son tarih olmadan skip/fixme yapılamaz. Aynı test iki CI koşusunda flaky olursa merge öncesi düzeltilir veya belgeli risk kabulü gerekir.
