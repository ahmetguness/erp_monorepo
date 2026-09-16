# AXON Mobil ERP - EAS Build & Mağaza Dağıtım Kılavuzu

Bu kılavuz, **AXON Mobil ERP** uygulamasının **Expo Application Services (EAS)** kullanılarak Google Play Store (Android) ve Apple App Store / TestFlight (iOS) ortamlarına güvenli, otomatik ve hatasız bir şekilde derlenmesi, test edilmesi ve yayınlanması adımlarını kapsar.

---

## 1. Ön Hazırlık ve EAS CLI Kurulumu

EAS CLI, Expo projelerini bulutta veya yerelde derlemek ve mağazalara göndermek için kullanılan resmi komut satırı aracıdır.

```bash
# 1. Global EAS CLI kurulumu
npm install -g eas-cli

# 2. Expo hesabınızla oturum açın
eas login

# 3. Proje dizinine geçin ve EAS yapılandırmasını doğrulayın
cd apps/mobile
eas whoami
```

---

## 2. Derleme Profilleri (`eas.json`)

`apps/mobile/eas.json` dosyasında 3 temel profil tanımlanmıştır:

| Profil | Dağıtım Türü | Android Çıktısı | iOS Çıktısı | Kullanım Amacı |
| :--- | :--- | :--- | :--- | :--- |
| **`development`** | Internal | Standalone APK | Simulator Build | Yerel geliştirme ve dev client testleri. |
| **`preview`** | Internal | Standalone APK (Doğrudan yüklenebilir) | Ad-Hoc IPA | Şirket içi QA, müşteri kabul testleri ve test cihazlarına doğrudan yükleme. |
| **`production`** | Store | Android App Bundle (`.aab`) | App Store IPA (`.ipa`) | Google Play Console & TestFlight / App Store yayınları. |

---

## 3. Android Dağıtım Akışı (Google Play Console)

### 3.1 Google Cloud & Service Account Yapılandırması
1. **Google Cloud Console** üzerinden yeni bir Servis Hesabı (Service Account) oluşturun.
2. Rol olarak **Google Play Android Developer** yetkisi atayın.
3. **JSON Anahtarı** oluşturup indirin ve adını `google-service-account.json` yaparak `apps/mobile/` dizinine yerleştirin (Bu dosya `.gitignore` listesindedir, asla repo'ya push etmeyin!).
4. **Google Play Console > API Erişimi** sayfasından ilgili servis hesabını bağlayın ve **Sürümleri Yönetme** izinlerini verin.

### 3.2 Önizleme (APK) Derlemesi Alma
QA ekibinin veya saha personelinin mağaza beklemeden telefonuna yükleyebileceği APK:
```bash
eas build --platform android --profile preview
```
*Derleme tamamlandığında EAS terminalinde doğrudan QR kod ve indirme linki sunulur.*

### 3.3 Production (AAB) Derleme ve Kapalı Teste Gönderim
```bash
# 1. Google Play için optimize edilmiş AAB derlemesi
eas build --platform android --profile production

# 2. Otomatik olarak Google Play Console Kapalı Test (Internal Track) kanalına yükleme
eas submit --platform android --profile production
```

---

## 4. iOS Dağıtım Akışı (Apple App Store & TestFlight)

### 4.1 Apple Geliştirici Hesabı & Sertifikalar
EAS, iOS sertifikalarını (`Distribution Certificate` ve `Provisioning Profile`) Apple Developer API üzerinden otomatik olarak yönetir.

İlk derleme sırasında EAS size şu soruyu soracaktır:
> `Do you want EAS to handle your Apple credentials?` -> **Yes** seçeneğini seçin.

### 4.2 TestFlight & App Store İçin Derleme ve Gönderim
```bash
# 1. Production IPA derlemesini başlatın
eas build --platform ios --profile production

# 2. Derleme tamamlandığında TestFlight'a otomatik iletin
eas submit --platform ios --profile production
```

### 4.3 TestFlight Kullanıcı Grupları
1. **App Store Connect > Uygulamalar > AXON ERP > TestFlight** sekmesine gidin.
2. **Dahili Test Grubu (Internal Testers):** Şirket içi geliştiriciler (Apple hesabı olanlar), inceleme gerekmeksizin hemen indirir.
3. **Harici Test Grubu (Beta Testers):** Müşteriler ve saha çalışanları. Apple'ın kısa beta incelemesinden sonra kamuya açık bir bağlantı (Public Link) ile 10.000 kişiye kadar dağıtılabilir.

---

## 5. Ortam Değişkenleri ve Gizli Anahtarlar (EAS Secrets)

API adresleri ve hassas anahtarlar kod tabanında tutulmaz; EAS Secrets üzerinden güvenli bir şekilde derleme esnasında enjekte edilir:

```bash
# Production API Uç Noktası
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.axon-erp.com --type string

# Sentry DSN (Hata İzleme)
eas secret:create --scope project --name SENTRY_DSN --value https://your-sentry-dsn.ingest.sentry.io/12345 --type string
```

---

## 6. Canlı Güncelleme (Over-The-Air / OTA Updates)

Native kod değişikliği gerektirmeyen (yalnızca JavaScript / UI / Stil / İş mantığı) güncellemeleri mağaza onay süresi (1-3 gün) beklemeden kullanıcılara anında gönderebilirsiniz:

```bash
# Production kanalına anlık OTA güncellemesi basma
eas update --branch production --message "FAZ 11: Finans ekranı güvenlik ve performans iyileştirmesi"
```

---

## 7. Yayın Öncesi Güvenlik & Kalite Kontrol Listesi

- [x] **SSL Pinning & HTTPS:** Tüm backend istekleri TLS 1.3 ve geçerli sertifikayla şifrelenmiştir.
- [x] **Ekran Kaydı Koruması:** `FinanceScreen` ve `EmployeePortalScreen` üzerinde `FLAG_SECURE` aktiftir.
- [x] **Cihaz Bütünlüğü:** `security.service.ts` ile Root / Jailbreak / Frida enjeksiyonları taranır.
- [x] **60 FPS Liste Performansı:** `OptimizedFlatList` ve `OptimizedImage` disk önbelleklemesi devreye alınmıştır.
- [x] **Birim Testleri:** 25/25 birim testi yeşil durumdadır (`npm --workspace=mobile run test`).
- [x] **Maestro E2E Senaryoları:** Kritik login, çevrimdışı senkronizasyon ve AI Copilot test akışları hazırdır.
- [x] **Uygulama Sürümü:** `app.json` ve `eas.json` sürümleri (`1.0.0`) senkronizedir.
