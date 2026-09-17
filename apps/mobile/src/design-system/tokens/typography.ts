// apps/mobile/src/design-system/tokens/typography.ts

import { TextStyle } from 'react-native';

export const typography = {
  sizes: {
    '2xs': 10,
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
  lineHeights: {
    tight: 1.15,
    snug: 1.25,
    normal: 1.4,
    relaxed: 1.5,
  },
  letterSpacing: {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.2,
  },
} as const;

/**
 * Tabular numbers style preset for financial figures, counters, barcodes, and dates.
 * Guarantees zero layout shift or width flickering during count transitions.
 */
export const tabularNumericStyle: TextStyle = {
  fontVariant: ['tabular-nums'],
  letterSpacing: -0.2,
};

/**
 * Micro-label industrial uppercase style preset
 */
export const microLabelStyle: TextStyle = {
  fontSize: typography.sizes['2xs'],
  fontWeight: typography.weights.bold,
  letterSpacing: typography.letterSpacing.widest,
  textTransform: 'uppercase',
};
