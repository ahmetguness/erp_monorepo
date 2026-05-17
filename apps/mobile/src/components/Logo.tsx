import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../theme';

interface LogoProps {
  showText?: boolean;
  size?: 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ showText = true, size = 'md' }) => {
  const iconSize = size === 'lg' ? 48 : 28;
  const svgSize = size === 'lg' ? 24 : 16;
  const textSize = size === 'lg' ? 32 : 18;

  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { width: iconSize, height: iconSize, borderRadius: size === 'lg' ? 12 : 6 }]}>
        <Svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </Svg>
      </View>
      {showText && (
        <Text style={[styles.text, { fontSize: textSize }]}>
          Axon<Text style={styles.textHighlight}>ERP</Text>
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconBox: {
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  textHighlight: {
    color: '#60A5FA', // blue-400
  },
});
