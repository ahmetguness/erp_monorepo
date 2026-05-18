# Migration Repair Runbook

Bu not local/dev veritabaninda `prisma db push` ile sema senkronlandigi halde
`prisma migrate status` temiz gorunmediginde kullanilir.

## Kontrol

```powershell
npm run db:health
```

Komut iki seyi kontrol eder:

- `schema.prisma` icindeki model tablolarinin `public` semasinda var olup olmadigi.
- Prisma migration gecmisinin temiz olup olmadigi.

## Temiz DB Kurulumu

Yeni bir local DB icin tercih edilen akis:

```powershell
npx prisma migrate dev
npm run db:seed
```

## Db Push Sonrasi Migration Gecmisi

Eger local veritabanina daha once `npx prisma db push` uygulandiysa tablolar var
olabilir ama `_prisma_migrations` bos kalabilir. Bu durumda:

1. `npm run db:health` ile tablolarin eksiksiz oldugunu dogrula.
2. Veritabani yalnizca local/dev ise migration gecmisini Prisma ile uzlastir.
3. Production verisi icin `migrate resolve` kullanmadan once yedek ve manuel inceleme zorunludur.

Local/dev icin ornek:

```powershell
npx prisma migrate resolve --applied 20260402183731_init
npx prisma migrate resolve --applied 20260403000000_add_plan_features_and_user_pricing
npx prisma migrate resolve --applied 20260403134435_add_plan_features_and_user_pricing
npx prisma migrate resolve --applied 20260503170316_add_marketplace_sync_webhook_snapshot
npx prisma migrate resolve --applied 20260504000000_add_enums_fk_relations_indexes
npx prisma migrate resolve --applied 20260516120000_add_image_attachment_entity_types
npm run db:health
```

## Notlar

- `db push` migration gecmisini yazmaz; sadece semayi gunceller.
- `migrate resolve --applied` tablo yaratmaz, sadece migration kaydini isaretler.
- Production icin tercih edilen akis `npx prisma migrate deploy` olmalidir.

