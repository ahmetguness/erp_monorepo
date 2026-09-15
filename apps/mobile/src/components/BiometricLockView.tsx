import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Logo } from './Logo';
import { Button } from './common';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';
import {
  checkBiometricsAvailability,
  authenticateWithBiometrics,
  BiometricAvailability,
} from '../lib/biometrics';

export const BiometricLockView: React.FC = () => {
  const { theme } = useTheme();
  const logout = useAuthStore((state) => state.logout);
  const setBiometricLocked = useAuthStore((state) => state.setBiometricLocked);
  const user = useAuthStore((state) => state.user);

  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    checkBiometricsAvailability().then((info) => {
      setBiometrics(info);
      handleBiometricAuth(info.biometricTypeName);
    });
  }, []);

  const handleBiometricAuth = async (typeName = 'Biyometrik') => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);

    const success = await authenticateWithBiometrics(
      `Axon ERP hesabınıza giriş için ${typeName} kullanın`
    );

    setIsAuthenticating(false);

    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setBiometricLocked(false);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const getIconName = () => {
    if (biometrics?.biometricType === 'FaceID') return 'scan-outline';
    return 'finger-print-outline';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Logo size="lg" />

        <View style={styles.lockBox}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: theme.colors.primaryMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Ionicons
              name={getIconName()}
              size={56}
              color={theme.colors.primary}
            />
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>
            Uygulama Kilitli
          </Text>

          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Hoş geldiniz, {user?.name || 'Kullanıcı'}. Devam etmek için kimliğinizi doğrulayın.
          </Text>

          <Button
            title={`${biometrics?.biometricTypeName || 'Biyometrik'} ile Doğrula`}
            variant="primary"
            size="lg"
            leftIcon={
              <Ionicons
                name={getIconName()}
                size={22}
                color={theme.colors.white}
              />
            }
            onPress={() => handleBiometricAuth(biometrics?.biometricTypeName)}
            style={styles.authButton}
          />
        </View>

        <TouchableOpacity
          onPress={() => logout()}
          style={styles.logoutButton}
          activeOpacity={0.7}
        >
          <Text style={[styles.logoutText, { color: theme.colors.danger }]}>
            Farklı Hesapla Giriş Yap
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  lockBox: {
    alignItems: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  authButton: {
    width: '100%',
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
