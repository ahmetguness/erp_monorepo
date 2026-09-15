import { lightColors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { borderRadius } from './borderRadius';

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './borderRadius';
export * from './shadows';
export * from './ThemeContext';

export const theme = {
  colors: lightColors,
  spacing,
  typography,
  borderRadius,
};

export type Theme = typeof theme;
