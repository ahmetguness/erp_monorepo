// apps/mobile/src/design-system/tokens/spacing.ts

export const spacing = {
  '3xs': 2,
  '2xs': 4,
  xs: 6,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const borderRadius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;

export interface ResponsiveGutter {
  screenHorizontal: number;
  cardPadding: number;
  itemGap: number;
}

export const responsiveGutters = {
  compactPhone: {
    screenHorizontal: 12,
    cardPadding: 12,
    itemGap: 8,
  },
  phone: {
    screenHorizontal: 16,
    cardPadding: 16,
    itemGap: 12,
  },
  tabletPortrait: {
    screenHorizontal: 24,
    cardPadding: 18,
    itemGap: 16,
  },
  tabletLandscape: {
    screenHorizontal: 32,
    cardPadding: 20,
    itemGap: 20,
  },
} as const;
