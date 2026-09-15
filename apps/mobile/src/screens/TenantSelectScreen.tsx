import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper, Header, Card, Badge } from '../components/common';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { switchTenant, AvailableTenant } from '../services/auth.service';
import { RootStackParamList } from '../types/navigation.types';

type Props = {
  navigation?: any;
  route?: {
    params?: {
      canGoBack?: boolean;
    };
  };
};

export default function TenantSelectScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const availableTenants = useAuthStore((state) => state.availableTenants);
  const activeTenant = useAuthStore((state) => state.tenant);
  const setSwitchTenant = useAuthStore((state) => state.switchTenant);

  const [loadingTenantId, setLoadingTenantId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canGoBack = route?.params?.canGoBack ?? navigation?.canGoBack?.();

  const handleSelectTenant = async (tenant: AvailableTenant) => {
    if (activeTenant?.id === tenant.id) {
      if (navigation?.canGoBack?.()) {
        navigation.goBack();
      } else if (navigation?.navigate) {
        navigation.navigate('Main');
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoadingTenantId(tenant.id);
    setErrorMsg(null);

    try {
      const result = await switchTenant({ tenantId: tenant.id });
      setSwitchTenant(result.tenant, result.user, result.availableTenants);
      if (navigation?.canGoBack?.()) {
        navigation.goBack();
      } else if (navigation?.navigate) {
        navigation.navigate('Main');
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        'Şirket değiştirilemedi. Lütfen tekrar deneyin.';
      setErrorMsg(message);
    } finally {
      setLoadingTenantId(null);
    }
  };

  const handleBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else if (navigation?.navigate) {
      navigation.navigate('Main');
    }
  };

  return (
    <ScreenWrapper>
      <Header
        title="Şirket Seçimi"
        subtitle="Çalışmak istediğiniz işletmeyi seçin"
        showBack={Boolean(canGoBack)}
        onBack={handleBack}
      />

      <View style={styles.container}>
        {errorMsg && (
          <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerMuted }]}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{errorMsg}</Text>
          </View>
        )}

        <FlatList
          data={availableTenants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.headerNote, { color: theme.colors.textMuted }]}>
              Hesabınıza bağlı {availableTenants.length} aktif işletme bulundu:
            </Text>
          }
          renderItem={({ item }) => {
            const isActive = activeTenant?.id === item.id;
            const isLoading = loadingTenantId === item.id;

            return (
              <Card
                variant={isActive ? 'elevated' : 'outlined'}
                style={[
                  styles.tenantCard,
                  isActive && { borderColor: theme.colors.primary, borderWidth: 2 },
                ]}
                onPress={() => handleSelectTenant(item)}
              >
                <View style={styles.tenantRow}>
                  <View
                    style={[
                      styles.avatarBox,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primaryMuted
                          : theme.colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name="business-outline"
                      size={24}
                      color={isActive ? theme.colors.primary : theme.colors.textMuted}
                    />
                  </View>

                  <View style={styles.tenantInfo}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[
                          styles.companyName,
                          {
                            color: theme.colors.text,
                            fontWeight: isActive ? '700' : '600',
                          },
                        ]}
                      >
                        {item.companyName}
                      </Text>
                    </View>
                    <Text style={[styles.slugText, { color: theme.colors.textMuted }]}>
                      @{item.slug}
                    </Text>
                  </View>

                  <View style={styles.rightColumn}>
                    <Badge
                      label={item.plan}
                      variant={item.plan === 'ENTERPRISE' ? 'primary' : 'neutral'}
                      size="sm"
                    />
                    {isLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                        style={{ marginTop: 6 }}
                      />
                    ) : isActive ? (
                      <View style={styles.activeTag}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={theme.colors.success}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerNote: {
    fontSize: 13,
    marginBottom: 16,
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 32,
  },
  tenantCard: {
    marginBottom: 12,
  },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  tenantInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  companyName: {
    fontSize: 16,
    marginBottom: 2,
  },
  slugText: {
    fontSize: 12,
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  activeTag: {
    marginTop: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});
