// apps/mobile/src/design-system/utils/haptics.ts

import * as Haptics from 'expo-haptics';

/**
 * Haptic Language 2.0 (Faz 22.3)
 * Standardized industrial tactile feedback patterns for field, sales, and warehouse workflows.
 */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Başarılı sipariş/tahsilat: 2 kısa ritmik onay titreşimi (Success double pulse)
 */
export async function hapticSuccessDoublePulse(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await sleep(100);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not supported on device or disabled in OS
  }
}

/**
 * Hata / Kredi limiti aşımı: 3 keskin uyarı titreşimi (Warning triple pulse)
 */
export async function hapticWarningTriplePulse(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await sleep(80);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await sleep(80);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics not supported on device
  }
}

/**
 * Barkod okuma: 1 net mekanik tık (Rigid impact)
 */
export async function hapticBarcodeScan(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  } catch {
    // Haptics not supported on device
  }
}

/**
 * Hafif arayüz dokunması (Hafif buton/menü seçimi)
 */
export async function hapticLightTap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics not supported
  }
}

/**
 * Orta sertlikte dokunma (Kritik buton basımı, modal açma)
 */
export async function hapticMediumTap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics not supported
  }
}

/**
 * Ağır dokunma (Silme, kalıcı işlem)
 */
export async function hapticHeavyTap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics not supported
  }
}

/**
 * Liste veya picker öğe seçimi (Selection tick)
 */
export async function hapticSelection(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch {
    // Haptics not supported
  }
}
