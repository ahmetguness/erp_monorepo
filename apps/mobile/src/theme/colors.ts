// apps/mobile/src/theme/colors.ts
import {
  quantumDarkColors,
  quantumLightColors,
  highContrastColors,
  QuantumColors,
} from '../design-system/tokens/colors';

export type ThemeColors = QuantumColors;

export const lightColors: ThemeColors = quantumLightColors;
export const darkColors: ThemeColors = quantumDarkColors;
export const highContrastThemeColors: ThemeColors = highContrastColors;
