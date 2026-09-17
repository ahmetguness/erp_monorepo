import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { z } from 'zod';
import { Input, Button, Card } from '../components/common';
import { Logo } from '../components/Logo';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { SplitAuthLayout } from '../features/auth';
import { login } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';
import { getAuthToken } from '../lib/token-storage';
import {
  checkBiometricsAvailability,
  authenticateWithBiometrics,
  BiometricAvailability,
} from '../lib/biometrics';

const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz'),
  password: z.string().min(1, 'Şifre alanı zorunludur'),
  tenantSlug: z.string().trim().optional(),
});

interface Props {
  navigation?: any;
  onBack?: () => void;
}

export default function LoginScreen({ navigation, onBack }: Props) {
  const { theme } = useTheme();
  const { isTablet } = useResponsive();
  const setAuthData = useAuthStore((state) => state.login);
  const isBiometricEnabled = useAuthStore((state) => state.isBiometricEnabled);
  const savedUser = useAuthStore((state) => state.user);
  const savedTenant = useAuthStore((state) => state.tenant);
  const savedAvailableTenants = useAuthStore((state) => state.availableTenants);
  const lastEmail = useAuthStore((state) => state.lastEmail);

  const [email, setEmail] = useState(lastEmail || '');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [showSlugInput, setShowSlugInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);
  const [canUseQuickBio, setCanUseQuickBio] = useState(false);

  useEffect(() => {
    if (lastEmail && !email) {
      setEmail(lastEmail);
    }
  }, [lastEmail]);

  useEffect(() => {
    checkBiometricsAvailability().then(async (info) => {
      setBiometrics(info);
      if (info.available && isBiometricEnabled && savedUser && savedTenant) {
        const token = await getAuthToken();
        if (token) {
          setCanUseQuickBio(true);
        }
      }
    });
  }, [isBiometricEnabled, savedUser, savedTenant]);

  const handleQuickBiometricLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const success = await authenticateWithBiometrics(
      `Hoş geldiniz ${savedUser?.name || 'Kullanıcı'}. Giriş yapmak için doğrulayın.`
    );
    if (success) {
      const token = await getAuthToken();
      if (token && savedUser && savedTenant) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setAuthData(savedUser, savedTenant, savedAvailableTenants);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert('Oturum Zaman Aşımı', 'Güvenliğiniz için lütfen şifrenizle giriş yapınız.');
        setCanUseQuickBio(false);
      }
    }
  };

  const handleLogin = async () => {
    setErrors({});
    const validation = loginSchema.safeParse({ email, password, tenantSlug });

    if (!validation.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0] as 'email' | 'password';
        if (field) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const data = await login({
        email: email.trim(),
        password,
        tenantSlug: tenantSlug.trim() || undefined,
      });

      setAuthData(data.user, data.tenant, data.availableTenants);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // If user belongs to multiple tenants, offer selection
      if (data.availableTenants && data.availableTenants.length > 1 && navigation?.navigate) {
        navigation.navigate('TenantSelect', { availableTenants: data.availableTenants });
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const message =
        error?.response?.data?.error?.message ||
        'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.';
      setErrors({ form: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Şifre Sıfırlama',
      'Şifrenizi sıfırlamak için lütfen şirket yöneticiniz ile iletişime geçin veya web portalı üzerinden şifremi unuttum adımını kullanın.'
    );
  };

  const loginCard = (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.logoWrapper}>
          <Logo size="md" />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Tenant Girişi
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          İşletme hesabınıza güvenle giriş yapın
        </Text>
      </View>

      {errors.form ? (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerMuted }]}>
          <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            {errors.form}
          </Text>
        </View>
      ) : null}

      {/* Quick Biometric Button */}
      {canUseQuickBio && (
        <View style={styles.bioContainer}>
          <Button
            title={`${biometrics?.biometricTypeName || 'Face ID'} ile Hızlı Giriş`}
            variant="outline"
            leftIcon={
              <Ionicons
                name={biometrics?.biometricType === 'FaceID' ? 'scan-outline' : 'finger-print-outline'}
                size={20}
                color={theme.colors.primary}
              />
            }
            onPress={handleQuickBiometricLogin}
            style={styles.bioButton}
          />
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.dividerText, { color: theme.colors.textMuted }]}>veya e-posta ile</Text>
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          </View>
        </View>
      )}

      <View style={styles.form}>
        <Input
          label="E-posta Adresi"
          placeholder="ad.soyad@sirket.com"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          errorText={errors.email}
          leftIcon={<Ionicons name="mail-outline" size={18} color={theme.colors.textMuted} />}
        />

        <Input
          label="Şifre"
          placeholder="••••••••"
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          isPassword
          editable={!isLoading}
          errorText={errors.password}
          leftIcon={<Ionicons name="lock-closed-outline" size={18} color={theme.colors.textMuted} />}
        />

        {showSlugInput ? (
          <Input
            label="Şirket Kısa Kodu (İsteğe Bağlı)"
            placeholder="ornek-holding"
            value={tenantSlug}
            onChangeText={setTenantSlug}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            helperText="Birden çok şirketiniz varsa doğrudan ilgili şirkete girmek için yazabilirsiniz"
            leftIcon={<Ionicons name="business-outline" size={18} color={theme.colors.textMuted} />}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setShowSlugInput(true)}
            style={styles.slugToggle}
          >
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.slugToggleText, { color: theme.colors.primary }]}>
              Şirket kodu belirt
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity onPress={handleForgotPassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.forgotText, { color: theme.colors.primary }]}>
              Şifremi Unuttum
            </Text>
          </TouchableOpacity>
        </View>

        <Button
          title="Giriş Yap"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          onPress={handleLogin}
          style={styles.submitButton}
        />
      </View>
    </Card>
  );

  if (isTablet) {
    return (
      <SplitAuthLayout>
        {loginCard}
      </SplitAuthLayout>
    );
  }

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.colors.background }]}>
      {/* Top Header Background */}
      <View style={[styles.topBackground, { backgroundColor: theme.colors.primary }]}>
        <SafeAreaView edges={['top']} style={styles.topNav}>
          <TouchableOpacity
            onPress={onBack || (() => navigation?.goBack?.())}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={[styles.backButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            disabled={isLoading}
          >
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.cardContainer}>
            {loginCard}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  topBackground: {
    height: 180,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingBottom: 32,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  card: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrapper: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  bioContainer: {
    marginBottom: 16,
  },
  bioButton: {
    marginBottom: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    paddingHorizontal: 8,
  },
  form: {
    width: '100%',
  },
  slugToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    marginTop: -4,
  },
  slugToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    width: '100%',
  },
});
