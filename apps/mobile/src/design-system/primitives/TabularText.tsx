// apps/mobile/src/design-system/primitives/TabularText.tsx

import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { tabularNumericStyle } from '../tokens/typography';

export interface TabularTextProps extends TextProps {
  style?: TextStyle | TextStyle[];
}

export const TabularText: React.FC<TabularTextProps> = ({
  children,
  style,
  ...rest
}) => {
  return (
    <Text
      style={[tabularNumericStyle, style]}
      {...rest}
    >
      {children}
    </Text>
  );
};
