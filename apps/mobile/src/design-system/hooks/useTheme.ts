// apps/mobile/src/design-system/hooks/useTheme.ts

import { useTheme as useBaseTheme } from '../../theme/ThemeContext';
import { ambientGlows } from '../tokens/shadows';

export function useTheme() {
  const context = useBaseTheme();

  return {
    ...context,
    glows: ambientGlows,
    colors: context.theme.colors,
  };
}
