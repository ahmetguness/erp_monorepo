# ERP Global Release & Production Readiness Roadmap

**Kapsam:** Multi-tenant ERP · Mimari sağlamlaştırma · Entegrasyon testleri · Güvenlik · Ölçeklenebilirlik · Production · Pilot  
**Plan:** 16 hafta, 12 faz  
**Temel strateji:** Yeni modüller eklemek yerine mevcut modüllerin birlikte güvenilir çalıştığını kanıtlamak; üretim onayını takvime değil çıkış kriterlerine bağlamak.

> **Son depo doğrulama tarihi: 17 Ekim 2026.** Bu plan artık yalnızca önceki assurance raporlarına değil, mevcut backend/web kaynak ağacına ve yerel kalite komutlarının güncel çıktısına dayanır. 95 Prisma migration dizini doğrulandı. Modül COMPLETE, test dosyasının varlığı veya assurance script'inin bulunması ERP'nin production-ready olduğu anlamına gelmez.

## 0. Doğrulanmış mevcut durum ve mimari

### Backend

- Hono tabanlı tek uygulama girişi; route kayıtları `bootstrap/http`, `modules/*/index.ts` ve kısmen eski `routes/*` katmanlarına dağılmış durumda.
- 12 tenant modülü merkezi registry üzerinden bağlanıyor: identity, inventory, sales, finance, procurement, production, workforce/service, marketplace, automation/intelligence, collaboration, recovery ve platform.
- Merkezi response contract, security header, CORS, rate limit, body validation ve browser yüzeylerinde CSRF middleware'i var.
- Tenant API'leri `requireAuth` ve `requireActiveTrial` arkasında; public, admin, SCIM, BI, portal ve auth yüzeyleri açıkça tenant-isolation bypass kullanıyor. Bu bypass'lar tasarım gereği olsa da ayrı güvenlik sınırı olarak test edilmelidir.
- Prisma/PostgreSQL kalıcılığı, Redis, ayrı `api`/`worker` rolleri ve domain-event outbox worker mevcut. Outbox sıfırdan tasarlanacak bir özellik değil; coverage, atomic write, lease/retry/idempotency ve recovery davranışı denetlenecek mevcut altyapıdır.
- Entegrasyon testi ayrı test dosyaları yerine büyük bir özel runner (`run-integration-tests.ts`) içinde HTTP + gerçek DB akışları çalıştırıyor. Bu yapı kapsama sağlasa da hata izolasyonu, paralelleştirme ve raporlama açısından bölünmelidir.

### Web

- Next.js App Router; `(auth)`, `(dashboard)`, `admin`, `checkout`, `status` ve API docs yüzeyleri var. UI; `components`, `features`, `hooks`, yaklaşık 95 service ve üç Zustand store üzerinden ayrışıyor.
- Tenant ve admin için ayrı Axios istemcileri var. Tenant response boundary kontrolü ve merkezi hata normalizasyonu mevcut; admin mutation'larında otomatik idempotency key var.
- Route proxy yalnız cookie varlığından gezinme kararı veriyor; gerçek authorization backend'de kalmalıdır. Web route gizleme hiçbir zaman permission kontrolü kabul edilmemelidir.
- 19 web unit test dosyası ve 86 Playwright spec dosyası mevcut. Dosya/spec sayısı başarı kanıtı değildir; clean-environment sonuçları ve artifact'ler gereklidir.

### 17 Ekim 2026 — Faz 1 sonrası yerel baseline

| Kontrol | Sonuç | Yorum |
|---|---:|---|
| `npm run typecheck` | PASS | Types, backend, web ve mobile strict typecheck tamamlandı |
| Permission gating scanner | PASS | Backend gerçek route graph'ı ve web `NAV_GROUPS` kaynağı birlikte doğrulanıyor |
| Tenant isolation scanner | PASS | 15 aday sınıflandırıldı; mutation'lar tenant-scoped hale getirildi, cross-tenant worker bypass'ı gerekçelendirildi |
| API contract scanner | PASS | 1.176 sahte bulgu kaldırıldı; kanonik manifest gerçek Hono route registry'sinden üretiliyor |
| Module boundaries | PASS | 2.404 backend ve 2.613 web import edge'i doğrulandı; beş private-module import'u public API'ye taşındı |
| Unit testler | PASS | Backend 161/161, web 50/50 |
| Journal Entries assurance | PASS | Validation, atomicity, concurrency, reversal uniqueness, fiscal period, trial balance, permission ve tenant isolation |
| Backend emit düzeni | PASS | `rootDir: "."`; temiz build yalnız `dist/src`, `dist/scripts`, `dist/prisma` üretiyor; `dist/src/index.js` Docker entrypoint'i mevcut |
| CI tanımı | YOK | Depoda GitHub Actions/GitLab/Azure/Jenkins pipeline dosyası bulunmadı |
| Migration dizini | 95 | Sayı doğrulandı; temiz DB deploy, drift ve rollback/forward-fix kanıtı ayrıca gerekli |

**Faz 1 kararı: PASS. Genel production kararı: NO-GO.** Global type/scanner blocker'ları temizlendi; production kararı CI, cross-module E2E, staging, yük ve DR fazları tamamlanmadığı için değişmedi.

## 1. Genel zaman çizelgesi

| Faz | Konu | Hafta | Öncelik |
|---|---|---|---|
| 1 | Global release blocker temizliği | 1–2 | P0 |
| 2 | CI ve assurance altyapısı | 2–3 | P0 |
| 3 | Cross-module E2E | 3–5 | P0 |
| 4 | Veri bütünlüğü ve concurrency | 4–6 | P0 |
| 5 | Multi-tenant güvenlik | 5–7 | P0/P1 |
| 6 | Async jobs ve entegrasyonlar | 6–8 | P1 |
| 7 | Staging, deployment ve versiyonlama | 7–9 | P0/P1 |
| 8 | Yük, performans ve maliyet | 9–11 | P1 |
| 9 | Backup, restore ve DR | 10–12 | P0 |
| 10 | Observability ve operasyon | 11–13 | P1 |
| 11 | Pilot müşteri ve UAT | 13–15 | P0 |
| 12 | Release ve kontrollü açılış | 16 | P0 |

Fazlar örtüşebilir; ancak kritik bağımlılıklar ve kalite kapıları atlanmamalıdır.

### Kapasite planlama varsayımları

- 140 tenant.
- Tenant başına 50 kullanıcı; toplam yaklaşık 7.000 kayıtlı kullanıcı.
- %25 eşzamanlı çevrimiçi kullanıcı varsayımı; yaklaşık 1.750 kullanıcı.
- Depolama planları: Starter 500 MB, Professional 10 GB, Enterprise 100 GB başlangıç; dosya başına limitler sırasıyla 5/25/100 MB.
- Eşzamanlı çevrimiçi kullanıcı sayısı, aynı anda API isteği yapan kullanıcı sayısı değildir. İstek/saniye hedefleri gerçek trafik profiliyle belirlenecektir.
- 1.750 sanal kullanıcı doğrudan kabul hedefi yapılmamalı; tenant dağılımı, kullanıcı başına işlem sıklığı, endpoint karışımı, rapor boyutu ve arka plan job hacmi ölçülerek arrival-rate/RPS modeli çıkarılmalıdır.

---

# Aşama I — Global kalite ve veri bütünlüğü

## Faz 1 — Global release blocker temizliği (Hafta 1–2)

**Amaç:** Repository'nin tamamının güvenilir biçimde derlenmesi, yetki kurallarının ve API kontratlarının doğrulanması.

**Durum (17 Ekim 2026): TAMAMLANDI.** Typecheck, Prisma architecture, module boundaries, permission gating, tenant isolation/runtime guard, security hardening, API contract, backend/web unit ve Journal Entries assurance kontrolleri PASS. Backend scanner'ından web kaynak import'u kaldırıldı; açık `rootDir` ve temiz-build adımıyla production emit/Docker yolu güvenceye alındı.

### 1.1 Journal Entries backend typecheck

**14 Ekim 2026'da yeniden üretildi:** `apps/backend/scripts/check-journal-entries-assurance.ts:232` — `JournalEntryLineUncheckedCreateWithoutJournalEntryInput` içinde `tenantId` uyumsuzluğu. Bu hata production kodundan önce assurance fixture'ında görülüyor; kök neden doğrulanmadan şema veya domain modeli değiştirilmemelidir.

**Görevler:**
1. Prisma modelini, relation tanımlarını ve generated client tiplerini karşılaştır.
2. `tenantId` alanının journal line'a mı yoksa parent journal entry'ye mi ait olduğunu doğrula.
3. Assurance fixture'ını gerçek şema kontratına uygun düzelt.
4. `prisma generate`, backend typecheck ve journal assurance testlerini çalıştır.
5. Posting, reversal, fiscal period ve tenant isolation regresyonlarını yeniden çalıştır.
6. `as any`, `@ts-ignore` veya kontrolsüz type cast ile hatayı gizleme.

### 1.2 Static guard ve API contract denetimi

Güncel çalıştırmada doğrulanan envanter:

| Kontrol | İncelenecek bulgu |
|---|---:|
| Permission manifest | 41 |
| Tenant isolation static guard | 14 |
| API contract scanner | 1.176 |

Her bulguyu **gerçek ürün/güvenlik hatası**, **scanner false positive**, **eksik metadata/manifest**, **bilinçli istisna** veya **eski/kullanılmayan route** olarak sınıflandır. Bunların tamamını otomatik olarak gerçek ürün hatası sayma. Gerçek hatalar için regresyon testi; bilinçli istisnalar için yazılı gerekçe ve sorumlu oluştur.

**Ön koşul — route graph scanner onarımı:** Backend route'ları artık yalnız `src/index.ts` içindeki doğrudan `app.route(...)` çağrılarında değil; `bootstrap/http/routes.ts` → `tenantModules` → `modules/*/index.ts` → `routes/*` zinciriyle bağlanıyor. Mevcut permission ve API contract scanner'ları bu graph'ı eksik çözümlüyor. Önce tek bir kanonik route manifest üreticisi oluştur; mümkünse runtime Hono route registry/OpenAPI çıktısından, değilse AST tabanlı olarak tüm mount zincirinden method + full path + auth + permission + plan/feature gate metadata'sı üret. Permission ve contract kontrolleri aynı manifesti kullansın.

**Scanner kabul testi:** Bilinen mevcut route'lar (`/api/contacts`, `/api/invoices`, `/api/accounting/journal-entries`, `/api/admin/auth/me`) manifestte görünmeli; kasıtlı olarak bozuk fixture yakalanmalı; dinamik path ve `ANY` tekrarları tekilleştirilmeli. 1.176 sayısı ancak scanner bu testleri geçtikten sonra yeniden baseline alınarak değiştirilmeli.

**Çıkış kriterleri:** Backend/frontend typecheck PASS; açıklanmamış kritik permission/tenant isolation bulgusu yok; güvenilir API contract scanner; Journal Entries finansal regresyonları PASS; açık P0 yok.

## Faz 2 — CI/CD ve assurance standardizasyonu (Hafta 2–3)

> **Uygulama durumu (2026-10-17): KOD TAMAMLANDI / HOSTED CI PENDING.** Workflow, temiz PostgreSQL migration kapısı, üç bağımsız entegrasyon shard'ı, JUnit/JSON/Playwright artefaktları, PR smoke + main regresyon ayrımı, production build ve supply-chain kontrolleri eklendi. Gerçek GitHub Actions koşusu görülmeden faz PASS sayılmaz. İşletim ayrıntıları: `docs/ci-assurance.md`.

**Amaç:** Modül bazlı HTTP/DB/Playwright testlerini otomatik kalite kapısına dönüştürmek.

**Önerilen pipeline:**

```text
Pull Request / Commit
        |
        +-- Lint + Typecheck
        +-- Prisma Validate
        +-- Backend Unit
        +-- Frontend Unit
        |
        v
HTTP + PostgreSQL Assurance
        |
        v
Cross-module + Playwright
        |
        v
Release Candidate
```

**Görevler:**
- GitHub Actions veya mevcut CI sağlayıcısında bağımsız job'lar.
- PostgreSQL test DB'sini migration'larla sıfırdan oluşturma.
- Paralel job'ların ortak fixture üzerinde yarışmasını önleme.
- Windows/Next.js Playwright için gerektiğinde doğrulanmış external-server lifecycle yaklaşımı.
- JUnit/JSON raporları; commit SHA, migration sürümü, ortam ve fixture bilgileri.
- Flaky testleri saklamadan takip etme.
- PR için hızlı smoke, main/release için kapsamlı regression.
- Başarısız zorunlu testte merge/release engeli.
- Root `test` komutunun gerçekten tüm zorunlu kontrolleri kapsadığını doğrulama: permission gating, tenant isolation/runtime guard, security hardening ve production build bugün ana root zincirinde açıkça görünmüyor.
- Backend'teki tek parça integration runner'ını domain/capability bazlı shard'lara bölme; benzersiz test-run kimliği, transaction/cleanup garantisi, timeout ve JUnit artifact'i ekleme.
- Web Playwright runner'ının yalnız admin senaryolarını mı yoksa 86 spec'in tamamını mı çalıştırdığını kanıtlama; browser matrisi ve accessibility kontrolünü ayrı zorunlu job yapma.
- Lockfile tabanlı `npm ci`, dependency/license/secret scan, SBOM ve container image vulnerability scan ekleme.

**Çıkış kriteri:** Temiz ortamda tek commit'ten kurulum ve otomatik zorunlu testlerin güvenilir biçimde tamamlanması.

## Faz 3 — Cross-module E2E assurance (Hafta 3–5)

**Amaç:** Tekil modüllerin birlikte çalışırken stok, muhasebe, yetki ve tenant invariant'larını koruduğunu kanıtlamak.

### Paket A — Order-to-Cash (ilk öncelik)

```text
Müşteri + Ürün
→ Satış Teklifi
→ Satış Siparişi
→ Stok Rezervasyonu
→ İrsaliye
→ Fatura
→ Tahsilat
→ Journal Posting / Cari Bakiye
```

**Senaryolar:** Kısmi teslimat/faturalama; indirim/KDV/döviz/yuvarlama; aynı stok için iki eşzamanlı satış; duplicate tahsilat; fatura iptali ve ters muhasebe kayıtları; transaction failure; cross-tenant erişim.

**Invariant:** Stok miktarı, fatura, tahsilat, cari bakiye ve muhasebe hareketleri birbirini doğrulamalı.

### Paket B — Procure-to-Pay

`Purchase Request → Approval → Purchase Order → Goods Receipt → Supplier Invoice → Three-Way Match → Payment`

**Kontroller:** Çift onay, fazla mal kabul, fazla faturalama, duplicate ödeme, kısmi teslim, muhasebe kayıtları.

### Paket C — Üretim

`BOM → MRP → Capacity → Work Order → Material Consumption → Quality Control → Finished Goods`

**Kontroller:** Hammadde tüketimi, fire, kapasite aşımı, kalite reddi, stok hareketleri ve maliyet.

### Paket D — Marketplace

`Integration → Listing → Order → Inventory → Sales Order → Fulfillment`

**Kontroller:** Duplicate/out-of-order webhook, stok çakışması, iptal, iade, entegrasyon kopması.

### Paket E — Servis

`Customer Asset → Service Request → Assignment → Parts → Completion → Invoice`

**Kontroller:** Parça stok düşümü, onay, teknisyen yetkisi, fatura tutarlılığı.

### Paket F — Platform yönetimi

`Tenant → Subscription → Users → Roles → Permissions → API Keys → Revoke`

**Kontroller:** Plan limitleri, tenant isolation, permission cache invalidation, session/API key iptali.

**Çıkış kriteri:** Her zincirde success, failure, concurrency, retry ve cross-tenant senaryoları; HTTP cevabına ek bağımsız DB final-state ve finansal/stok invariant doğrulaması.

## Faz 4 — Transaction, concurrency ve veri bütünlüğü (Hafta 4–6)

**Amaç:** Tekrarlayan `SELECT → UPDATE`, lost-update, duplicate mutation ve eksik transaction hatalarını ortak mühendislik standardıyla azaltmak.

### Critical Mutation Contract

| Alan | Beklenen |
|---|---|
| Atomicity | İlgili değişikliklerin tamamı ya olur ya rollback edilir |
| Tenant scope | İlgili sorgular doğru tenant kapsamındadır |
| Concurrency | Paralel istekler invariant'ı bozamaz |
| Idempotency | Retry çift finansal/stok etki oluşturmaz |
| Audit | Gerçek state değişikliği doğru iz bırakır |
| Error handling | Kontrollü ve anlamlı hata |
| Recovery | Yarım işlem/orphan kayıt kalmaz |

**Teknik seçenekler:** PostgreSQL conditional update, unique constraint, transaction, uygun isolation level, advisory lock, sınırlı serialization retry. Her mutation için otomatik advisory lock kullanma; kilit stratejisini invariant'a göre seç.

**Ek kontroller:** Decimal para hassasiyeti, negatif stok koruması, shared/global user kayıtlarının tenant kapsamı, transaction ve audit/event tutarlılığı.

**Çıkış kriteri:** Kritik mutation'lar için sözleşme, concurrency/failure regression ve DB invariant kanıtı.

---

# Aşama II — Güvenlik ve entegrasyon güvenilirliği

## Faz 5 — Multi-tenant güvenlik ve erişim kontrolü (Hafta 5–7)

**Amaç:** Tenant A, Tenant B ve platform admin bağlamlarında tüm kritik kaynaklar için yetki/izolasyon kanıtı.

### Tenant isolation matrisi

| Kaynak | Doğrulama |
|---|---|
| Contacts, invoices, payments | Başka tenant finansal verisi okunamaz/değiştirilemez |
| Products, stock, warehouses | Başka tenant stok hareketi oluşturulamaz |
| Employees, payroll | Personel/bordro verisi sızmaz |
| Documents, attachments | URL ve storage key erişim kontrolünü atlatamaz |
| Chat | Mesaj ve dosyalar tenant sınırını aşmaz |
| Reports | Aggregate sorgular tenant sınırını aşmaz |
| AI/MCP tools | Tool çağrıları kullanıcı yetkisini aşmaz |
| API Keys | Anahtar yalnız yetkili tenant/scope için geçerli |

**Saldırı senaryoları:** URL/body `tenantId` değiştirme; başka tenant `productId/invoiceId/userId`; filtre/pagination sızıntısı; cross-tenant download linki; role downgrade sonrası eski token; tenant switch sonrası stale cache; admin-console isolation bypass'ın tenant endpoint'ine taşınması.

### AI/MCP güvenliği

```text
User Identity → Tenant Context → Permission Check → Tool Policy → MCP Execution → Audit
```

Toplu fatura iptali, muhasebe kaydı, veri silme, ödeme ve yetki değiştirme gibi yüksek etkili işlemlerde insan onayı. MCP açıklamaları ve harici tool çıktılarını güvenilir komut saymama; prompt injection ve tool-output manipulation testleri.

### Security hardening

OWASP ASVS benzeri kontroller: Authentication/MFA, session, authorization, input validation, rate limiting, file upload, secret management, dependency scanning, CSRF/CORS/cookies, audit, encryption.

**Çıkış kriteri:** Cross-tenant yetkisiz okuma/yazma yok; kritik mutation API bypass yok; MCP araçları aynı permission kurallarına tabi.

## Faz 6 — Async jobs, outbox ve harici entegrasyonlar (Hafta 6–8)

**Amaç:** E-posta, webhook, e-belge, marketplace, bildirim ve otomasyon işlemlerinin hata/retry altında güvenilirliği.

**Mevcut modelin doğrulanacak hedef davranışı:**

```text
Business Mutation
    ↓
PostgreSQL Transaction
(İş kaydı + Outbox Event)
    ↓
Background Worker
    ↓
E-posta / Webhook / Bildirim / Harici sağlayıcı
```

**Görevler:**
1. Mevcut queue/event altyapısını envanterle.
2. DB commit ile harici event arasındaki boşlukları bul.
3. Mevcut domain-event outbox kullanım kapsamını çıkar; doğrudan provider çağrısı yapan kritik mutation'ları gerektiğinde transactional outbox'a taşı.
4. Worker consumer'ları idempotent yap.
5. Exponential backoff + jitter, retry limitleri ve dead-letter yönetimi.
6. Webhook signature ve replay protection.
7. Timeout, HTTP 429 ve 5xx failure injection.
8. Job status, retry count ve hata nedenlerini izleme.
9. API ve worker deployment'larının aynı schema/event sürümünü konuştuğunu doğrula; rolling deployment sırasında forward/backward compatibility testi ekle.

| Hata | Beklenen davranış |
|---|---|
| DB commit başarılı, worker kapalı | Event kaybolmaz |
| Worker işlem ortasında çöker | Güvenli tekrar işleme |
| Duplicate webhook | Tek mantıksal etki |
| Sırasız webhook | State machine korunur |
| Provider timeout | Kontrollü retry |
| Kalıcı 400 | Sonsuz retry yok |
| Dead-letter replay | Duplicate iş etkisi yok |

> Outbox tek başına exactly-once teslimat sağlamaz. Hedef kalıcı event + idempotent consumer'dır.

**Çıkış kriteri:** Process crash, timeout ve duplicate delivery altında kritik iş etkisi kaybolmuyor/çift oluşmuyor.

---

# Aşama III — Production altyapısı ve ölçeklenebilirlik

## Faz 7 — Staging, deployment ve versiyonlama (Hafta 7–9)

| Ortam | Kullanım |
|---|---|
| Local | Geliştirme |
| CI | Otomatik izole doğrulama |
| Staging | Production benzeri release/entegrasyon |
| Production | Gerçek müşteri verileri |

Staging'de ham production verisi yerine sentetik veya güvenle anonimleştirilmiş veri kullan.

**Deployment kontrolü:** Production build, reverse proxy/HTTPS/cookies, DB pooling, Prisma migration, secret injection, env validation, health/readiness, graceful shutdown, worker restart, storage izinleri, cache invalidation, eski/yeni sürüm API uyumluluğu.

**Depoya özgü ek riskler:** Compose örneğinde production backend için local upload açık ve volume'a bağlı; gerçek production hedefinde R2/object storage, lifecycle ve erişim politikası zorunlu olmalı. `/health` yalnız process canlılığını gösteriyor; readiness DB/Redis/worker bağımlılıklarını ayrı ve güvenli biçimde göstermeli. API ve worker için bağımsız autoscaling, termination grace period ve outbox lease devri test edilmeli. Migration job'ı tekil çalışmalı; iki release'in aynı anda deploy edilmesi engellenmeli.

### ERP versiyonlama

**Öneri:** SemVer + tek release manifest + backward-compatible migration. Örnek: `ERP v1.0.0`.

Manifest içeriği: Git SHA, backend/frontend image digest, Prisma migration sürümü, feature flag sürümü, API contract sürümü, release tarihi ve rollback planı.

Migration yaklaşımı: **expand → migrate → contract**; kısa geçiş döneminde eski/yeni uygulama sürümleri uyumlu kalmalı.

Her release'te boş PostgreSQL'e `migrate deploy`, önceki production şemasından upgrade, Prisma schema/migration drift kontrolü ve forward-fix prosedürü test edilmeli. Veri kaybettirebilecek contract migration ayrı onay ve backup doğrulaması olmadan çalışmamalı.

**Çıkış kriteri:** Otomatik staging deployment; güvenli durdurma/rollback; migration sonrası veri bütünlüğü.

## Faz 8 — Performans, yük ve maliyet (Hafta 9–11)

### Önerilen yük basamakları

| Aşama | Eşzamanlı sanal kullanıcı |
|---|---:|
| Smoke | 25 |
| Baseline | 100 |
| Medium | 500 |
| Target | 1.750 |
| Stress | 2.500 |

Bu rakamlar test basamaklarıdır, doğrulanmış kapasite sonuçları değildir.

**Profiller:** Read-heavy (dashboard/search/report); write-heavy (order/invoice/stock/payment/upload); real-time (chat/WebSocket/presence); mixed workload; soak test (uzun süreli yük).

### Başlangıç SLO önerileri

| Metrik | Başlangıç hedefi |
|---|---|
| Yaygın read API p95 | < 300 ms |
| Kritik write API p95 | < 800 ms |
| Sunucu kaynaklı hata oranı | < %0,5 |
| Tenant isolation ihlali | 0 |
| Negatif stok / duplicate finansal etki | 0 |
| Kritik queue backlog | Tanımlı SLO içinde |
| Pilot availability | %99,5 başlangıç hedefi |

Ölçümler: CPU/RAM, PostgreSQL connections/slow query/lock/deadlock, pool saturation, queue latency, WebSocket sayısı, object storage, tenant başına tüketim, worker throughput.

**Maliyet odağı:** PostgreSQL, chat/dosya depolama ve egress, AI inference ve harici API. Starter/Professional/Enterprise ortak kota, atomik rezervasyon ve limit enforcement'ı yük altında doğrula.

**Çıkış kriteri:** Hedef workload altında invariant bozulmuyor; darboğaz, kapasite ve tenant başı maliyet raporlandı.

## Faz 9 — Backup, restore ve disaster recovery (Hafta 10–12)

Admin DR modülündeki evidence/simulation testleri, gerçek restore kabiliyetinin yerini tutmaz.

**Görevler:** Otomatik PostgreSQL backup; gerekiyorsa PITR; şifreli ve ayrı erişim alanında yedek; backup integrity; ayrı ortama restore; schema/veri doğrulama; object storage referansları; queue/outbox recovery; restore sonrası API smoke; backup izinleri ve anahtar kurtarma.

| Metrik | Önerilen pilot hedefi |
|---|---|
| RPO | En fazla 15 dakika |
| RTO | En fazla 4 saat |
| Restore tatbikatı | Pilot öncesi zorunlu |
| Kritik invariant integrity | %100 PASS |

Hedefler altyapı/maliyetle kesinleştirilmeli. Günlük backup tek başına 15 dakika RPO sağlamaz.

**Çıkış kriteri:** Gerçek backup'tan ayrı ortama restore; ölçülmüş RPO/RTO; restore sonrası kritik E2E testleri PASS.

## Faz 10 — Observability ve operasyon (Hafta 11–13)

**Üç sinyal:** Metrics (latency/error/throughput/queue/DB), structured logs (correlation ID, tenant context, redaction), distributed traces (HTTP → service → DB → worker → provider).

**ERP'ye özel alarmlar:** Tenant isolation ihlali; negatif stok; muhasebe posting tutarsızlığı; ödeme/webhook hata artışı; e-belge kuyruğu; dead-letter artışı; backup failure; audit hash-chain integrity; anormal login/MFA başarısızlıkları.

**Runbook içeriği:** Alarmın anlamı, etkilenen tenant/modüller, ilk teşhis, güvenli müdahale, rollback/recovery, escalation/iletişim, postmortem.

**Çıkış kriteri:** Staging incident simulation sırasında alarm, log/trace ve runbook ile sorun tespit ve giderme kanıtı.

## Faz 10.1 — Web kalite, erişilebilirlik ve istemci dayanıklılığı

- Kritik ekranlarda loading/empty/error/partial-data/permission-denied/trial-expired durumlarını standardize et.
- Tenant değişiminde query/store/cache temizliğini; eski tenant cevabının yeni ekrana yazılamadığını yarış koşuluyla test et.
- Tenant istemcisindeki finansal/stok mutation'ları için idempotency politikasını endpoint bazında tanımla; yalnız admin istemcisindeki otomatik key'e güvenme.
- WCAG 2.2 AA hedefi, klavye/focus, form hata duyuruları, tablo/sanal liste ve modal testleri; Chromium yanında en az bir ek browser motorunda kritik smoke.
- Büyük dashboard/table bundle'ları, hydration, Core Web Vitals ve istemci bellek sızıntıları için bütçe belirle.

**Çıkış kriteri:** Pilot kapsamındaki kritik web akışları permission, tenant-switch, hata/timeout, erişilebilirlik ve desteklenen browser matrisinde PASS.

## Faz 10.2 — Veri yönetişimi ve uyumluluk

- Veri sınıflandırması, saklama/silme, KVKK/GDPR talepleri, tenant export ve legal hold çakışmalarını tanımla.
- Log, trace, analytics, AI prompt/response ve support-session verilerinde PII/secret redaction testleri ekle.
- Şifreleme anahtarı rotation/kurtarma; API key/JWT/admin secret rotation prosedürlerini tatbik et.
- Audit kayıtlarının değiştirilemezlik, saat senkronizasyonu, actor/tenant/correlation bağlamı ve export bütünlüğünü doğrula.

**Çıkış kriteri:** Pilot veri işleme envanteri, saklama politikası, erişim/silme tatbikatı ve secret/key rotation kanıtı hazır.

---

# Aşama IV — Pilot ve production açılışı

## Faz 11 — Pilot müşteri ve UAT (Hafta 13–15)

**Öneri:** 140 tenant ile değil, 1–3 kontrollü pilot tenant ile başla.

**İlk pilot kapsamı:** Kullanıcı/rol/yetki; müşteri/tedarikçi; ürün/depo; satış siparişi/fatura; satın alma/mal kabul; tahsilat/ödeme; temel muhasebe; raporlama. Üretim, İK, marketplace ve gelişmiş AI otomasyonlarını müşteri ihtiyacına göre aşamalı aç.

**Örnek UAT:**
1. Müşteri oluştur.
2. Ürün ve stok tanımla.
3. Satış siparişi oluştur.
4. Kısmi teslimat yap.
5. Fatura oluştur.
6. Tahsilat kaydet.
7. Cari hesap ve raporları kontrol et.
8. Hatalı işlemi yetkili kullanıcıyla düzelt.
9. Yetkisiz kullanıcıyla işlemi dene.
10. Audit geçmişini doğrula.

| Pilot kriteri | Önerilen eşik |
|---|---|
| Açık P0/P1 güvenlik/veri bütünlüğü hatası | 0 |
| Temel UAT senaryoları | %100 PASS |
| Zorunlu cross-module testler | %100 PASS |
| Backup/restore tatbikatı | PASS |
| Tenant isolation | PASS |
| Kritik runbook'lar | Hazır |
| Düşük öncelikli açık hatalar | Kayıtlı/kabul edilmiş |

Kullanıcıların zorlandığı ekranları, fazla adımlı işlemleri ve eksik raporları ölç; yeni özellik backlog'unu gerçek pilot geri bildirimiyle oluştur.

## Faz 12 — Release ve kontrollü açılış (Hafta 16)

1. **Release Candidate:** Zorunlu CI, staging, migration ve güvenlik kontrolleri PASS.
2. **İç kullanım/kontrollü tenant:** Operasyon ekibi ve ilk pilot tenant ile sınırlı kullanım.
3. **Kademeli müşteri açılışı:** Tenant'ları gruplar halinde ekle; hata, latency ve maliyeti izle.
4. **Genel erişim:** Kapasite, güvenlik, destek ve operasyon kriterleri karşılanınca genişlet.

**Release öncesi:** Migration rollback planı, backup, müşteri bilgilendirmesi, destek kanalı, incident sorumluları ve feature flag kapatma prosedürü.

---

# Production GO / NO-GO kontrol listesi

Aşağıdaki kutular yapılacak/doğrulanacak işlerdir; mevcut durumda tamamlanmış oldukları varsayılmamalıdır.

### Kod ve kalite
- [ ] Backend ve frontend typecheck PASS.
- [ ] API/permission/tenant scanner'ları modüler route graph için güvenilir ve kendi kabul testleri PASS.
- [ ] Permission/tenant guard kritik bulguları kapalı.
- [ ] CI zorunlu testleri temiz ortamda geçiriyor.
- [ ] Production backend ve web container build + smoke PASS.

### Veri bütünlüğü
- [ ] Order-to-Cash E2E PASS.
- [ ] Procure-to-Pay E2E PASS.
- [ ] Kritik concurrency ve rollback testleri PASS.
- [ ] Finansal/stok invariant'larında açık kritik hata yok.

### Güvenlik
- [ ] Cross-tenant erişim testleri PASS.
- [ ] RBAC, MFA ve API key revoke PASS.
- [ ] Dosya ve MCP tool yetkilendirmesi PASS.
- [ ] Dependency, secret, SBOM ve container image taramaları kabul edilen eşiklerde.

### Altyapı
- [ ] Staging deployment ve rollback PASS.
- [ ] Hedef yük profili ve SLO doğrulandı.
- [ ] Gerçek backup/restore tatbikatı PASS.
- [ ] Alarm ve incident runbook testi PASS.
- [ ] Migration drift/upgrade ve API-worker rolling compatibility testi PASS.
- [ ] Production object storage ve veri lifecycle politikası PASS.

### Pilot
- [ ] Pilot tenant UAT tamamlandı.
- [ ] Zorunlu harici sağlayıcı entegrasyonları sertifikalandırıldı.
- [ ] Release onayı ve sorumlular belirlendi.
- [ ] Web accessibility, tenant-switch/cache ve kritik browser smoke PASS.
- [ ] KVKK/GDPR veri saklama, export/silme ve secret rotation prosedürleri doğrulandı.

---

# Sıralı teknik backlog

| Sıra | İş | Öncelik | Beklenen çıktı |
|---|---|---|---|
| 1 | Kanonik route manifest + scanner kabul testleri | P0 | Modüler mimariyi doğru okuyan contract/permission envanteri |
| 2 | Journal Entries fixture/typecheck | P0 | Temiz monorepo typecheck |
| 3 | Permission ve tenant guard sınıflandırması | P0 | Runtime testle destekli güvenilir guard sonucu |
| 4 | CI assurance pipeline + clean DB | P0 | Otomatik, tekrarlanabilir kalite kapısı |
| 5 | Migration drift/upgrade ve container smoke | P0 | Deploy edilebilir release adayı |
| 6 | Order-to-Cash E2E | P0 | Satış/finans invariant kanıtı |
| 7 | Procure-to-Pay E2E | P0 | Satın alma/muhasebe invariant kanıtı |
| 8 | Global concurrency ve idempotency audit | P0 | Kritik mutation güvenliği |
| 9 | Tenant isolation runtime security suite | P0 | Platform-geneli izolasyon |
| 10 | Async outbox/retry/rolling-version denetimi | P1 | Güvenilir entegrasyonlar |
| 11 | Staging + release pipeline | P0 | Tekrarlanabilir deployment |
| 12 | Web tenant-cache/accessibility/browser assurance | P1 | Güvenilir pilot kullanıcı deneyimi |
| 13 | Load/performance ve maliyet testi | P1 | RPS tabanlı kapasite raporu |
| 14 | Gerçek DR ve key-rotation tatbikatı | P0 | Ölçülmüş RPO/RTO ve kurtarma kanıtı |
| 15 | Observability + runbooks | P1 | Operasyon hazırlığı |
| 16 | Veri yönetişimi/KVKK-GDPR kabulü | P0 | Pilot veri işleme onayı |
| 17 | Pilot UAT | P0 | Müşteri kabul kanıtı |
| 18 | Production release | P0 | Kontrollü açılış |

## Her değişiklik için assurance rapor standardı

- **Change:** Hangi davranış değişti?
- **Invariant:** Hangi veri/güvenlik kuralı korunuyor?
- **Failure mode:** Hangi hata/concurrency senaryosu test edildi?
- **Evidence:** Hangi HTTP, DB, Playwright ve regresyon testleri çalıştı?
- **Scope:** Hangi tenant, rol ve modüller etkilendi?
- **Release impact:** Migration, feature flag, rollback veya veri düzeltmesi gerekli mi?
- **Residual risk:** Neler henüz doğrulanmadı?

## İlk uygulanacak agent görevi — Global Release Assurance Phase 1

> ERP monorepo projemi production readiness açısından denetle. İlk aşamada ürün davranışını gereksiz değiştirmeden mevcut mimariyi, test altyapısını ve global hataları analiz et.
>
> 1. `check-journal-entries-assurance.ts:232` Prisma `tenantId` uyuşmazlığının kök nedenini bul ve düzelt.
> 2. Önce kanonik backend route manifest üreticisini modüler bootstrap zincirini kapsayacak şekilde düzelt ve bilinen-route/bozuk-fixture kabul testlerini ekle.
> 3. Permission manifest içindeki 41 tutarsızlığı düzeltilmiş manifestle yeniden üret; gerçek hata/scanner false positive olarak sınıflandır.
> 4. Tenant isolation static guard içindeki 14 tutarsızlığı incele ve her aday için runtime Tenant A/Tenant B regresyonu ekle.
> 5. API contract scanner'daki 1.176 eşleşmezliği scanner kabul testlerinden sonra yeniden baseline alarak kategorilere ayır; `ANY` tekrarlarını ve route-discovery hatalarını ürün hatasından ayır.
> 6. Assurance script'leri ve CI komutlarını envanterle.
> 7. Cross-module transaction, concurrency, idempotency ve tenant isolation risklerini çıkar.
> 8. Production build, migration, environment ve deployment risklerini raporla.
>
> **Kurallar:** Mevcut domain kontratlarını gerekçesiz değiştirme. Scanner çıktısını otomatik ürün hatası kabul etme. Her düzeltme için regresyon testi çalıştır. Production/demo verisini değiştirme. Fixture'ları izole tut. İlişkisiz hataları gizleme. Çalıştırılmayan testi PASS gösterme.
>
> **Çıktı:** Global blocker listesi; severity/etkilenen modüller; kök neden; düzeltmeler; kalan riskler; cross-module test planı; CI/deployment readiness; nihai GO/NO-GO.
>
> Bu aşamada yalnızca global kalite problemlerini düzelt; yeni ERP özelliği geliştirme.

---

## Nihai uygulama sırası

**Global blocker temizliği → Cross-module assurance → Staging ve yük testleri → Gerçek backup/restore → Pilot GO/NO-GO → Kontrollü production açılışı.**

Takvim bir hedeftir; zorunlu kalite kapıları geçilmeden release yapılmamalıdır.
