// apps/mobile/src/design-system/primitives/AccessibleText.tsx

import React from 'react';
import { Text, TextProps, TextStyle, StyleProp } from 'react-native';

export interface AccessibleTextProps extends TextProps {
  /**
   * Maximum font scale multiplier permitted by the design system to prevent layout overflow.
   * Defaults to 1.35x (Faz 22.4 requirement).
   */
  maxFontSizeMultiplier?: number;
  /**
   * If true, text will dynamically scale down its font size to fit within its container.
   */
  autoFit?: boolean;
  /**
   * Minimum font scale ratio when autoFit is true. Defaults to 0.75.
   */
  minimumFontScale?: number;
  style?: StyleProp<TextStyle>;
}

export const AccessibleText: React.FC<AccessibleTextProps> = ({
  children,
  maxFontSizeMultiplier = 1.35,
  autoFit = false,
  minimumFontScale = 0.75,
  style,
  ...rest
}) => {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      adjustsFontSizeToFit={autoFit}
      minimumFontScale={minimumFontScale}
      style={style}
      {...rest}
    >
      {children}
    </Text>
  );
};
