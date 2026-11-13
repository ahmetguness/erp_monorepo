# Faz 4 — Transaction ve kritik mutation sözleşmeleri

## Kapsam ve mimari

Faz 3 A–F zincirlerinin kritik finansal/stok işlemleri ve tenant yönetimindeki paylaşılan kullanıcı güncellemesi incelendi. Mevcut transaction, conditional update ve unique constraint mekanizmaları korundu; tespit edilen açıklar aşağıdaki sözleşmelerle kapatıldı. Bütün mutation'lara otomatik advisory lock uygulanmaz.

| Mutation | Atomiklik ve kilit stratejisi | Retry / invariant kanıtı |
|---|---|---|
| Siparişten fatura | Sipariş satırına `FOR UPDATE`; kalan tutar transaction içinde Decimal ile hesaplanır; fatura, history, sipariş toplamı, zorunlu audit ve outbox birlikte commit edilir | Paralel iki tam tutarlı faturadan yalnız biri oluşur |
| Fatura onayı / iptali | Tenant + invoice anahtarı üzerinde ortak kilit; durum kilit alındıktan sonra yeniden okunur; onay posting key, journal, cari ve history ile atomiktir | Aynı onay tek etki; çift iptal tek ters kayıt/history/audit; tahsisatlı fatura iptal edilemez |
| Ödeme oluşturma | Fatura kilitleri sıralı/tekil alınır; bakiye ve fatura durumu transaction içinde doğrulanır; payment, allocation, invoice status/history, cari, audit, outbox tek transaction | Aynı key aynı ödeme; farklı payload conflict; aşırı tahsisat ve iptal edilmiş/taslak faturaya tahsisat reddedilir |
| Ödeme ters kaydı | Aynı sıralı fatura kilitleri; COMPLETED → CANCELLED conditional update; tahsisat silme, durum hesaplama, cari ters kayıt ve zorunlu audit atomiktir | Çift iptal tek etki; tahsisat kalmaz; audit hatası commit'i engeller |
| Fatura durum taraması | Aynı fatura kilidi; durum güncellemesi ve history tek transaction | Tarama/iptal yarışında CANCELLED fatura yeniden açılamaz |
| Stok rezervasyonu / tüketimi | Mevcut tenant+ürün+depo kilidi ve stok politikası; hareket, fiziksel bakiye, maliyet caller transaction'ında | Rakip satışlar aynı stoğu ayıramaz; yetersiz stokta rollback |
| Mal kabul | Mevcut PO/idempotency kilitleri; replay kimliği miktar/depo/satırlar ile doğrulanır | Fazla kabul ve değiştirilmiş replay reddedilir; paralel retry tek stok etkisi |
| Üretim | İş emri satır kilidi; kalite ve state yeniden kontrolü; sarf/çıktı/değerleme/history/muhasebe transaction içinde | Normal/otomatik tamamlamada duplicate çıktı yok; CANCELLED otomatik tamamlanamaz; çıktı miktarı pozitif olmalı |
| Marketplace / servis | Mevcut sipariş/servis transaction kilitleri; stok ve iş kaydı birlikte yazılır | Duplicate fulfillment, iptal/iade ve servis tamamlamada stok invariant'ları korunur |
| Tenant kullanıcı profili | Üyelik/sahiplik/global paylaşım kontrolü Serializable transaction içinde; yalnız P2034 için en fazla üç deneme, kısa exponential backoff+jitter | Gerçek PostgreSQL serialization yarışı lost update üretmez; paylaşılan global profil tenant yönetiminden değiştirilemez |

Finansal kilit protokolü `services/financial/mutation-locks.ts`, sınırlı Serializable çalıştırıcı `lib/serializable-transaction.ts` içindedir. Retry callback'leri yalnız DB işi içerir; harici provider/listener çağrıları retry transaction'ına alınmaz. P2002 ve iş doğrulama hataları körlemesine tekrar denenmez. Serializable denemeleri tükenirse kontrollü 409 döner.

`createAuditLog(..., { required: true })` kritik transaction'larda hatayı yukarı taşır. Eski best-effort çağrılarının davranışı korunur. Ödeme/fatura event intent'i `enqueueDomainEvent` ile mevcut outbox tablosuna PENDING yazılır; commit sonrası mevcut dispatch/worker kullanılır. Bu, business commit ile event kaydı arasındaki boşluğu kapatır; harici exactly-once teslimat iddiası değildir. Worker/crash kapsamlı kabulü Faz 6 konusudur.

Web ödeme hook'u başarıdan sonra payments, invoices, contacts, sales-orders ve accounting cache'lerini birlikte invalid eder; kullanıcı commit sonrası eski bakiye ve tahsilat oranı görmez. Mevcut idempotency key ve kontrollü API hatası sözleşmeleri korunur.

## Doğrulama

13 Kasım 2026 yerel sonuç: 11 dosyada 39/39 PostgreSQL/HTTP testi; backend 161/161 ve web 60/60 birim testi; backend/web typecheck, değişen web hook'u ESLint ve module-boundary kontrolü başarılı. Yeni kod explicit `any`, `as unknown as` veya TypeScript bastırma yorumu içermez.

`tests/cross-module/scenarios/mutation-contract.test.ts` gerçek HTTP uygulaması ve izole PostgreSQL üzerinde şunları doğrular:

- Aynı siparişe iki paralel faturanın toplamı sipariş tutarını aşmaz.
- Fatura iptali ve ödeme tahsisatından yalnız biri commit olur.
- Paralel iptal ve ödeme ters kaydı tek mantıksal etki üretir.
- Audit ve outbox için ayrı PostgreSQL trigger failure injection; payment/allocation/cari/event rollback; aynı key ile recovery.
- Gerçek Serializable write conflict sonrası retry ile iki artış korunur.
- P2034 için üç deneme sınırı ve P2002 için tek deneme; her başarısız denemenin DB yazımı geri alınır.
- Ödeme ters kaydında audit hatası; ödeme COMPLETED, fatura PAID ve tahsisat/cari kayıtları korunur; hata kaldırılınca iptal başarılı olur.
- Paylaşılan global kullanıcı ve iptal edilmiş üretim state'i korunur.
- Otomatik üretimde NaN/sonsuz/sıfır/negatif miktar planlanan miktara dönüştürülmez; durum, history ve stok kaydı değişmeden reddedilir. Varsayılan miktar ve muhasebe aktörü kilitli iş emri kaydından okunur.

Faz 3 stok, muhasebe, tenant, retry ve concurrency senaryoları da aynı zorunlu CI cross-module job'ında çalışır. Test SQL trigger'ları yalnız suite'in izin verdiği `phase3_*_ci` veritabanında kurulur ve finally ile kaldırılır. Gerçek/development tenant verisi kullanılmaz. Yeni migration gerekmez.

```powershell
$env:CROSS_MODULE_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/phase3_local_ci?schema=public'
npm.cmd run test:cross-module
npm.cmd --workspace=@repo/backend run test:typecheck
npm.cmd --workspace=@repo/backend run test:unit
npm.cmd --workspace=web run typecheck
npm.cmd --workspace=web run test:unit
npm.cmd run test:module-boundaries
```

JSON/JUnit kanıtı `artifacts/cross-module/` altındadır. Yerel PostgreSQL doğrulaması hosted CI sonucu veya production yük testi olarak sunulmaz. Depo genelindeki önceki kalite borcu bu fazın kapsamıyla kapanmış sayılmaz.
