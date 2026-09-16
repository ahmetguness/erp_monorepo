import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import { Image as ExpoImage, ImageProps as ExpoImageProps, ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

// Neutral subtle blurhash placeholder for smooth progressive rendering
const DEFAULT_BLURHASH =
  '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

export interface OptimizedImageProps extends Omit<ExpoImageProps, 'source'> {
  source: string | number | ImageSource | null | undefined;
  fallbackSource?: ImageSource | string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  fallbackIconSize?: number;
  containerStyle?: StyleProp<ViewStyle>;
  showLoadingIndicator?: boolean;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  fallbackSource,
  fallbackIcon = 'image-outline',
  fallbackIconSize = 24,
  style,
  containerStyle,
  contentFit = 'cover',
  transition = 200,
  priority = 'normal',
  placeholder = DEFAULT_BLURHASH,
  showLoadingIndicator = false,
  ...props
}) => {
  const { theme } = useTheme();
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [source]);

  // Normalize source
  let resolvedSource: ImageSource | string | number | null = null;
  if (typeof source === 'string') {
    resolvedSource = source.trim().length > 0 ? { uri: source } : null;
  } else if (source) {
    resolvedSource = source;
  }

  // If there's an error or no source, check fallbackSource
  if ((hasError || !resolvedSource) && fallbackSource) {
    resolvedSource =
      typeof fallbackSource === 'string' ? { uri: fallbackSource } : fallbackSource;
  }

  if (hasError || !resolvedSource) {
    return (
      <View
        style={[
          styles.fallbackContainer,
          {
            backgroundColor: theme.colors.borderSubtle,
            borderColor: theme.colors.border,
          },
          style as ViewStyle,
          containerStyle,
        ]}
      >
        <Ionicons name={fallbackIcon} size={fallbackIconSize} color={theme.colors.textMuted} />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <ExpoImage
        source={resolvedSource}
        style={style}
        contentFit={contentFit}
        transition={transition}
        priority={priority}
        cachePolicy="memory-disk"
        placeholder={placeholder}
        onLoadStart={() => {
          if (showLoadingIndicator) setIsLoading(true);
        }}
        onLoad={() => {
          setIsLoading(false);
          setHasError(false);
        }}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        {...props}
      />
      {isLoading && showLoadingIndicator && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});
