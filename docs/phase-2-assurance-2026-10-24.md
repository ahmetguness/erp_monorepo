# Faz 2 doğrulaması — 24 Ekim 2026

Durum: kod ve yerel düzeltme/doğrulama çalışması tamamlandı; hosted CI kabulü bekleniyor. Bu rapor GitHub Actions veya production onayı değildir.

## Değişiklikler

- Tarayıcı CI job'larına ayrı PostgreSQL, migration, seed, tamamlanmış onboarding fixture'ı ve gerçek API başlangıcı eklendi. API health yanıtından sonra test başlar.
- Entegrasyon shard'larının temiz DB üzerinde ihtiyaç duyduğu kanonik plan özellikleri seed adımıyla sağlandı.
- Erişilebilirlik ayrı zorunlu CI job'ı oldu; admin klavye erişimi tarayıcıda test ediliyor. Şifre gösterme düğmesi klavye sırasına alındı.
- CI coverage eşikleri ve coverage artefaktları zorunlu hale getirildi. Playwright retry ile geçen testlerde de başarısız olur.
- CLI çözümlemesi npm workspace düzenine uyarlandı; web/API aynı localhost hostunu kullanıyor. Açıkça belirtilmiş harici sunucu yoksa CI kendi web sürecini başlatır.
- Tüm 95 web spec'i ortak fixture girişine bağlandı. TCMB dış servisi sabitleniyor; gerçek cari/fatura/API/DB smoke işlemleri korunuyor.
- Tarayıcı tarafından iptal edilen GET istekleri bağlantı arızalarından ayrıldı. Başarısız mutation ve gerçek bağlantı hatalarının gizlenmediğini doğrulayan 10 unit testi eklendi.
- Eski CORS portu, geçmiş tarihli MFA fixture'ı, sabit para birimi kodu ve simülasyon tamamlanmadan formu değiştiren test düzeltildi. Para birimi fixture'ı benzersiz kod seçiyor ve kendi kaydını temizliyor.
- Rapor runner'ı Windows'ta npm'i shell yorumlaması olmadan başlatıyor; timeout'ta süreç ağacını sonlandırıyor. Başarı/hata/timeout/spawn-error için dört regresyon testi var. Raporlar shard, migration sürümü, ortam ve fixture bilgisi içeriyor.
- Eksik/uyumsuz transitive ve peer dependency kayıtları düzeltildi; SBOM üretimi doğrulandı. Üretilmiş Playwright raporları ESLint kapsamından çıkarıldı.

## Yakalanan ürün hatası

Bağımsız finance shard'ı eşzamanlı e-belge retry'ında aralıklı `409/201` üretti. İlk idempotency sorgusu ile kaynak belge sorgusu arasındaki pencerede diğer istek commit edebiliyordu. Kaynak sorgusunda aynı key ve aynı submission kimliği görülürse mevcut kayıt döndürülüyor; başka key/kaynak çakışmaları reddedilmeye devam ediyor. Mevcut HTTP/DB regresyonu aynı kayıt kimliğini ve tek DB kaydını doğruluyor. Düzeltmeden sonra finance shard'ı geçti.

## Yerel kanıt

Ortam: Windows, Node 24.22.1, ayrı PostgreSQL 18; test DB `127.0.0.1:55432/phase2_ci`. CI tanımı Node 22 / PostgreSQL 17 kullanır; hosted eşdeğerlik henüz kanıtlanmadı.

| Kontrol | Sonuç |
|---|---|
| Temiz PostgreSQL migration deploy | 98/98 uygulandı |
| Seed ve tarayıcı fixture hazırlığı | PASS |
| Types/backend/web/mobile ayrı typecheck | PASS |
| Module boundaries, Prisma architecture/validate, contract, tenant static/runtime, security, permission guard'ları | PASS |
| Backend unit | 161/161 PASS |
| Web unit | 60/60 PASS |
| Mobile unit | 119/119 PASS |
| Rapor runner regresyonları | 4/4 PASS |
| Backend/web coverage | Tanımlı eşikler PASS |
| Web lint | PASS; 0 hata, önceden mevcut 5 uyarı |
| Backend/web production build | PASS |
| npm ci dry-run, izole manifest/lockfile kopyası | PASS; gerçek temiz kurulum yerine geçmez |
| CycloneDX SBOM, lockfile üzerinden | PASS; 1.349 bileşen |
| Lisans kontrolü | PASS; istisna yok |
| npm audit critical kapısı | PASS; 0 critical, 13 high, 12 moderate açık |
| Tam Chromium regresyonu | 95 dosyada 209 senaryo: 206 PASS, 3 FAIL |
| Üç başarısız senaryonun bulunduğu dosyalar, düzeltme sonrası | 7/7 PASS; retry kapalı |
| Son Chromium/Firefox smoke | 16/16 PASS; retry kapalı |
| Ayrı accessibility projesi | 4/4 PASS; retry kapalı; statik accessibility kontrolü de PASS |

Tam regresyonun başarısız koşusu PASS olarak etiketlenmedi. Üç düzeltmenin kanıtı ayrı hedefli koşudur; nihai değişikliklerin tamamı üzerinde yeni bir tam hosted koşu hâlâ gereklidir. Tam koşu JSON/JUnit dosyaları `artifacts/phase2-regression-full`, düzeltme koşusu dosyaları `artifacts/phase2-regression-fixed` altında saklandı. Unit raporları `artifacts/unit`, shard raporları `artifacts/integration`, diğer yerel çıktılar `artifacts/phase2-*` altındadır.

## Kabul öncesi kalan dış doğrulamalar

1. Değişikliklerin bulunduğu commit üzerinde gerçek GitHub Actions koşusu ve tüm zorunlu job'ların başarılı olması.
2. GitHub branch protection / ruleset içinde gerekli kontrollerin merge'i engelleyecek şekilde etkinleştirildiğinin doğrulanması.
3. Linux/Node 22 üzerinde gerçek `npm ci`; backend/web container build, Trivy ve Gitleaks sonuçları. Yerelde Docker CLI yok.

`npm run test:fast` girişi Windows Prisma engine DLL yeniden adlandırmasında `EPERM` ile durdu; sandbox dışında tekrarı da aynı sonucu verdi. Ayrı typecheck, guard, unit, coverage, integration ve production build komutları çalıştırıldı. Bu nedenle root komutunun bütünü PASS diye raporlanmaz.

98 migration ile alınan kanıt, çalışmaya başlarken zaten mevcut olan `20261024130000_add_missing_schema_fields` dosyasını da içerir. Henüz izlenmeyen bu migration CI commit'ine dahil edilmelidir; production/demo DB'sine uygulanmadı. Tüm DB işlemleri ayrı test kümesinde yapıldı.

Faz 2'nin hosted kabulü bu kanıtlar olmadan PASS değildir. Genel production kararı değişmedi: NO-GO.
