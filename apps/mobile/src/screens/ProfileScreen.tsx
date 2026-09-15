import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper, Header, Card, Badge, Button } from '../components/common';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';
import {
  checkBiometricsAvailability,
  authenticateWithBiometrics,
  BiometricAvailability,
} from '../lib/biometrics';

type Props = {
  navigation?: any;
};

export default function ProfileScreen({ navigation }: Props) {
  const { theme, isDark, toggleTheme } = useTheme();

  const user = useAuthStore((state) => state.user);
  const tenant = useAuthStore((state) => state.tenant);
  const availableTenants = useAuthStore((state) => state.availableTenants);
  const isBiometricEnabled = useAuthStore((state) => state.isBiometricEnabled);
  const setBiometricEnabled = useAuthStore((state) => state.setBiometricEnabled);
  const logout = useAuthStore((state) => state.logout);

  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);

  useEffect(() => {
    checkBiometricsAvailability().then(setBiometrics);
  }, []);

  const handleToggleBiometric = async (newValue: boolean) => {
    if (!biometrics?.available) {
      Alert.alert(
        'Biyometrik Kimlik Desteklenmiyor',
        'Cihazınızda kayıtlı bir Face ID veya Parmak İzi bulunamadı.'
      );
      return;
    }

    if (newValue) {
      const success = await authenticateWithBiometrics(
        `${biometrics.biometricTypeName} ile giriş yapmayı etkinleştirmek için doğrulayın`
      );
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setBiometricEnabled(true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setBiometricEnabled(false);
    }
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Çıkış Yap',
      'Oturumunuzu kapatmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  const isOwner = user?.tenantMembership?.isOwner;
  const roleName = user?.tenantMembership?.role?.name || (isOwner ? 'Şirket Yöneticisi' : 'Personel');

  return (
    <ScreenWrapper scrollable>
      <Header title="Profil & Ayarlar" subtitle="Hesap ve güvenlik tercihleri" />

      <View style={styles.container}>
        {/* User & Company Card */}
        <Card variant="elevated" style={styles.userCard}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primaryMuted }]}>
              <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AX'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: theme.colors.text }]}>
                {user?.name || 'Kullanıcı'}
              </Text>
              <Text style={[styles.userEmail, { color: theme.colors.textMuted }]}>
                {user?.email || '-'}
              </Text>
              <View style={styles.badgeRow}>
                <Badge
                  label={roleName}
                  variant={isOwner ? 'primary' : 'neutral'}
                  size="sm"
                />
                <Badge
                  label={tenant?.plan || 'STARTER'}
                  variant="info"
                  size="sm"
                  style={{ marginLeft: 6 }}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* Tenant Switching Section */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
          İşletme Bilgileri
        </Text>

        <Card variant="outlined" style={styles.settingsCard}>
          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.7}
            onPress={() => {
              if (navigation?.navigate) {
                navigation.navigate('TenantSelect', { canGoBack: true });
              }
            }}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                  {tenant?.companyName || 'İşletme'}
                </Text>
                <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
                  {availableTenants.length > 1
                    ? `${availableTenants.length} kayıtlı işletme (Değiştirmek için dokunun)`
                    : `@${tenant?.slug || 'holding'}`}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </Card>

        {/* Security & Preferences */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
          Güvenlik & Görünüm
        </Text>

        <Card variant="outlined" style={styles.settingsCard}>
          {/* Biometrics Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons
                  name={biometrics?.biometricType === 'FaceID' ? 'scan-outline' : 'finger-print-outline'}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                  {biometrics?.biometricTypeName || 'Biyometrik'} ile Giriş
                </Text>
                <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
                  {isBiometricEnabled
                    ? 'Uygulama açılışında kimlik doğrulanır'
                    : 'Hızlı ve güvenli kilit açma'}
                </Text>
              </View>
            </View>
            <Switch
              value={isBiometricEnabled}
              onValueChange={handleToggleBiometric}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.white}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

          {/* Theme Toggle */}
          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.7}
            onPress={toggleTheme}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons
                  name={isDark ? 'moon' : 'sunny'}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                  Karanlık Mod
                </Text>
                <Text style={[styles.settingHint, { color: theme.colors.textMuted }]}>
                  {isDark ? 'Koyu tema aktif' : 'Açık tema aktif'}
                </Text>
              </View>
            </View>
            <Ionicons
              name={isDark ? 'toggle' : 'toggle-outline'}
              size={32}
              color={isDark ? theme.colors.primary : theme.colors.textMuted}
            />
          </TouchableOpacity>
        </Card>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <Button
            title="Oturumu Kapat"
            variant="danger"
            leftIcon={<Ionicons name="log-out-outline" size={20} color={theme.colors.white} />}
            onPress={handleLogout}
          />
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  userCard: {
    marginBottom: 24,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsCard: {
    marginBottom: 24,
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingHint: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 64,
  },
  logoutContainer: {
    marginTop: 8,
    marginBottom: 32,
  },
});
