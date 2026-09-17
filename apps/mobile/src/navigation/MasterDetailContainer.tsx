// apps/mobile/src/navigation/MasterDetailContainer.tsx

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { useTheme } from '../design-system/hooks/useTheme';

export interface MasterDetailContainerProps {
  masterView: React.ReactNode;
  detailView?: React.ReactNode;
  masterWidth?: number;
  emptyDetailTitle?: string;
  emptyDetailSubtitle?: string;
  emptyDetailIcon?: keyof typeof Ionicons.glyphMap;
}

export const MasterDetailContainer: React.FC<MasterDetailContainerProps> = ({
  masterView,
  detailView,
  masterWidth = 380,
  emptyDetailTitle = 'İncelemek İçin Bir Kayıt Seçin',
  emptyDetailSubtitle = 'Detayları, belgeleri ve aksiyon butonlarını bu alanda görüntüleyebilirsiniz.',
  emptyDetailIcon = 'document-text-outline',
}) => {
  const { showMasterDetail } = useResponsive();
  const { theme } = useTheme();

  // On phones or portrait tablets, render master view directly
  if (!showMasterDetail) {
    return <View style={styles.singleViewContainer}>{masterView}</View>;
  }

  // Dual-pane split view on tablet landscape
  return (
    <View style={styles.splitViewContainer}>
      {/* Left Master List Pane */}
      <View
        style={[
          styles.masterPane,
          {
            width: masterWidth,
            borderRightColor: theme.colors.glassBorder,
            backgroundColor: theme.colors.surface0,
          },
        ]}
      >
        {masterView}
      </View>

      {/* Right Detail Inspection Pane */}
      <View
        style={[
          styles.detailPane,
          {
            backgroundColor: theme.colors.canvas,
          },
        ]}
      >
        {detailView ? (
          detailView
        ) : (
          <View style={styles.emptyDetailContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                {
                  backgroundColor: theme.colors.surface1,
                  borderColor: theme.colors.glassBorder,
                },
              ]}
            >
              <Ionicons name={emptyDetailIcon} size={40} color={theme.colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
              {emptyDetailTitle}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              {emptyDetailSubtitle}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  singleViewContainer: {
    flex: 1,
  },
  splitViewContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  masterPane: {
    height: '100%',
    borderRightWidth: 1,
  },
  detailPane: {
    flex: 1,
    height: '100%',
  },
  emptyDetailContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
});
