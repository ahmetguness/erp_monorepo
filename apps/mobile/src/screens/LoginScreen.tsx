import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { ScreenProps } from '../types';
import { login } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

const { width, height } = Dimensions.get('window');

export default function LoginScreen({ onBack }: ScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const setAuthData = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const data = await login({ email, password });
      setAuthData(data.user, data.tenant);
      // Başarılı giriş sonrası Zustand store güncellenir,
      // App.tsx içindeki isAuthenticated true olacağı için ekran otomatik değişir.
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      {/* Top Blue Background Graphic */}
      <View style={styles.topBackground}>
         <SafeAreaView edges={['top']} style={styles.topNav}>
            <TouchableOpacity onPress={onBack} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} style={styles.backButton} disabled={isLoading}>
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
            </TouchableOpacity>
         </SafeAreaView>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          <View style={styles.spacer} />

          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.logoWrapper}>
                <Logo size="md" />
              </View>
              <Text style={styles.title}>Hoş Geldiniz</Text>
              <Text style={styles.subtitle}>Hesabınıza giriş yapın</Text>
            </View>

            {errorMsg ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" style={{marginRight: 6}} />
                <Text style={styles.errorTextWrapper}>{errorMsg}</Text>
              </View>
            ) : null}

            <View style={styles.formContainer}>
              <Input 
                label="E-posta Adresi"
                placeholder="isim@sirket.com"
                value={email}
                onChangeText={(val) => { setEmail(val); setErrorMsg(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                icon={<Ionicons name="mail-outline" size={20} color="#94A3B8" />}
              />

              <Input 
                label="Şifre"
                placeholder="••••••••"
                value={password}
                onChangeText={(val) => { setPassword(val); setErrorMsg(''); }}
                secureTextEntry
                editable={!isLoading}
                icon={<Ionicons name="lock-closed-outline" size={20} color="#94A3B8" />}
                rightLabel={
                  <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Text style={styles.forgotPasswordText}>Şifremi Unuttum</Text>
                  </TouchableOpacity>
                }
              />

              <Button 
                title="Giriş Yap" 
                onPress={handleLogin} 
                isLoading={isLoading}
                style={styles.submitButton}
              />
            </View>
          </View>

          {/* Alt boşluğu doldurmak için Yardım/Destek alanı */}
          <View style={styles.supportContainer}>
            <Text style={styles.supportText}>Yardıma mı ihtiyacınız var? </Text>
            <TouchableOpacity hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.supportLink}>Destek Ekibine Ulaşın</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.spacer} />

          <View style={styles.bottomFooter}>
            <Text style={styles.footerText}>Axon ERP © 2026</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.42,
    backgroundColor: '#2563EB',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 80, // Minimum padding to avoid overlapping the back button
    paddingBottom: 24,
  },
  spacer: {
    flex: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoWrapper: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorTextWrapper: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  formContainer: {
    width: '100%',
  },
  forgotPasswordText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 14,
  },
  supportContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  supportText: {
    color: '#64748B',
    fontSize: 14,
  },
  supportLink: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomFooter: {
    marginTop: 'auto',
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
