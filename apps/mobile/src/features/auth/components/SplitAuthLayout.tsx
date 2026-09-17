// apps/mobile/src/features/auth/components/SplitAuthLayout.tsx

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme';
import { Logo } from '../../../components/Logo';
import { StatusPulseDot } from '../../../design-system/primitives/StatusPulseDot';
import { TabularText } from '../../../design-system/primitives/TabularText';

export interface SplitAuthLayoutProps {
  children: React.ReactNode;
}

export const SplitAuthLayout: React.FC<SplitAuthLayoutProps> = ({ children }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.rootContainer, { backgroundColor: theme.colors.background }]}>
      {/* ── Left Hero Showcase Panel (44% Width) ── */}
      <View
        style={[
          styles.heroPanel,
          {
            backgroundColor: theme.colors.surface1,
            borderRightColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.heroScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Product Identity */}
          <View style={styles.brandBlock}>
            <Logo size="lg" />
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
              AXON ERP <Text style={{ color: theme.colors.primary }}>3.0</Text>
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textSecondary }]}>
              Kurumsal Saha, Lojistik & Finans Yönetim Sistemi
            </Text>
          </View>

          {/* Value Propositions / Key Modules */}
          <View style={styles.modulesCard}>
            <View style={styles.moduleItem}>
              <View style={[styles.moduleIconWrap, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="cube-outline" size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moduleName, { color: theme.colors.text }]}>
                  WMS 2.0 & Akıllı Depo
                </Text>
                <Text style={[styles.moduleDesc, { color: theme.colors.textMuted }]}>
                  Lazer vizör barkod tarama, koridor-raf 2D planogramı ve anlık stok denetimi.
                </Text>
              </View>
            </View>

            <View style={styles.moduleItem}>
              <View style={[styles.moduleIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="cart-outline" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moduleName, { color: theme.colors.text }]}>
                  B2B Saha Satış & Müşteri 360
                </Text>
                <Text style={[styles.moduleDesc, { color: theme.colors.textMuted }]}>
                  Katalog + canlı sepet POS çift panel, anlık iskonto ve kredi risk takibi.
                </Text>
              </View>
            </View>

            <View style={styles.moduleItem}>
              <View style={[styles.moduleIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moduleName, { color: theme.colors.text }]}>
                  Kıymetli Evrak & Hazine
                </Text>
                <Text style={[styles.moduleDesc, { color: theme.colors.textMuted }]}>
                  Çek/senet portföyü, 3 günlük vade kehribar ikazı ve çift panelli banka ekstresi.
                </Text>
              </View>
            </View>
          </View>

          {/* System Telemetry & Offline Ready Badge */}
          <View
            style={[
              styles.telemetryBadge,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <StatusPulseDot variant="emerald" size={8} />
            <Text style={[styles.telemetryText, { color: theme.colors.textSecondary }]}>
              Sistem Aktif &bull; Çevrimdışı Veri Motoru Hazır
            </Text>
            <TabularText style={[styles.versionText, { color: theme.colors.textMuted }]}>
              v3.0.4-PRO
            </TabularText>
          </View>
        </ScrollView>
      </View>

      {/* ── Right Form Panel (56% Width) ── */}
      <View style={styles.formPanel}>
        <View style={styles.formCenterWrapper}>
          {children}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  heroPanel: {
    width: '44%',
    borderRightWidth: 1,
  },
  heroScrollContent: {
    padding: 36,
    justifyContent: 'center',
    gap: 32,
    minHeight: '100%',
  },
  brandBlock: {
    gap: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 12,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  modulesCard: {
    gap: 20,
  },
  moduleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  moduleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  moduleDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  telemetryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
  },
  telemetryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  formPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCenterWrapper: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 24,
  },
});
