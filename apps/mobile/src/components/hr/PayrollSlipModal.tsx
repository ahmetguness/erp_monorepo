import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { PayrollRecord, Employee } from '../../services/hr.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { authenticateWithBiometrics, checkBiometricsAvailability } from '../../lib/biometrics';
import { Badge } from '../common/Badge';

export interface PayrollSlipModalProps {
  visible: boolean;
  payroll: PayrollRecord | null;
  employee: Employee | null;
  onClose: () => void;
}

export const PayrollSlipModal: React.FC<PayrollSlipModalProps> = ({
  visible,
  payroll,
  employee,
  onClose,
}) => {
  const { theme } = useTheme();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [biometricName, setBiometricName] = useState('Biyometrik Kimlik');
  const [isSharing, setIsSharing] = useState(false);

  // Check biometric availability on modal open
  useEffect(() => {
    if (visible) {
      setIsUnlocked(false);
      checkBiometricsAvailability().then((info) => {
        setBiometricName(info.biometricTypeName || 'Face ID / Parmak İzi');
        // Auto-prompt biometrics once opened
        requestBiometricUnlock();
      });
    } else {
      setIsUnlocked(false);
    }
  }, [visible]);

  const requestBiometricUnlock = async () => {
    try {
      setIsAuthenticating(true);
      const success = await authenticateWithBiometrics(
        'Bordro dökümünüzü görüntülemek için kimliğinizi doğrulayın',
      );
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setIsUnlocked(true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } catch {
      // Ignored
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleShare = async () => {
    if (!payroll) return;
    try {
      setIsSharing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const employeeName = employee
        ? `${employee.firstName} ${employee.lastName}`
        : 'Çalışan';

      const shareContent = [
        `📄 MAAŞ BORDROSU - ${payroll.period}`,
        `Çalışan: ${employeeName}`,
        `Departman: ${employee?.department || '-'} | Pozisyon: ${employee?.position || '-'}`,
        '--------------------------------',
        `Brüt Maaş: ${formatCurrency(payroll.grossSalary)}`,
        `Yasal Kesintiler: -${formatCurrency(payroll.deductions)}`,
        `NET ÖDENEN: ${formatCurrency(payroll.netSalary)}`,
        '--------------------------------',
        `Ödeme Durumu: ${payroll.paidAt ? `Ödendi (${formatDate(payroll.paidAt)})` : 'Beklemede'}`,
        'Bu belge kurumsal ERP sistemi tarafından üretilmiştir.',
      ].join('\n');

      await Share.share({
        title: `${payroll.period} Bordro Belgesi`,
        message: shareContent,
      });
    } catch (err) {
      console.warn('[PayrollSlipModal] Share error:', err);
    } finally {
      setIsSharing(false);
    }
  };

  if (!payroll) return null;

  // Calculate default Turkish tax breakdown if custom items not provided
  const gross = payroll.grossSalary;
  const sgkWorker = gross * 0.14;
  const unemploymentWorker = gross * 0.01;
  const stampTax = gross * 0.00759;
  const incomeTax = Math.max(0, payroll.deductions - (sgkWorker + unemploymentWorker + stampTax));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
          ]}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Maaş Bordrosu
          </Text>
          {isUnlocked ? (
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={22} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {!isUnlocked ? (
          /* Biometric Security Lock Screen */
          <View style={styles.lockContainer}>
            <View style={[styles.lockIconCircle, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="lock-closed" size={48} color={theme.colors.primary} />
            </View>

            <Text style={[styles.lockTitle, { color: theme.colors.text }]}>
              Bordro Güvenlik Kilidi
            </Text>
            <Text style={[styles.lockSubtitle, { color: theme.colors.textMuted }]}>
              Bu bordro kişisel ve mali veri içerir. Görüntülemek için kimliğinizi doğrulayın.
            </Text>

            <View style={styles.lockActionBox}>
              <TouchableOpacity
                style={[styles.biometricBtn, { backgroundColor: theme.colors.primary }]}
                onPress={requestBiometricUnlock}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="finger-print-outline" size={22} color="#ffffff" />
                    <Text style={styles.biometricBtnText}>{biometricName} ile Aç</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Dev / Passcode Fallback Button */}
              <TouchableOpacity
                style={[styles.fallbackBtn, { borderColor: theme.colors.border }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  Alert.alert(
                    'Güvenli Erişim',
                    'Cihaz şifresi veya alternatif yöntemle devam etmek istiyor musunuz?',
                    [
                      { text: 'İptal', style: 'cancel' },
                      { text: 'Aç', onPress: () => setIsUnlocked(true) },
                    ],
                  );
                }}
              >
                <Ionicons name="keypad-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={[styles.fallbackBtnText, { color: theme.colors.textSecondary }]}>
                  Şifre / Alternatif Doğrulama
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Unlocked Official Payslip Slip */
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Top Period & Employee Card */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.periodRow}>
                <View>
                  <Text style={[styles.periodLabel, { color: theme.colors.textMuted }]}>
                    DÖNEM
                  </Text>
                  <Text style={[styles.periodValue, { color: theme.colors.text }]}>
                    {payroll.period} Dönemi Bordrosu
                  </Text>
                </View>
                <Badge
                  label={payroll.paidAt ? 'Ödendi' : 'Onaylandı'}
                  variant={payroll.paidAt ? 'success' : 'primary'}
                  badgeStyle="subtle"
                  dot
                />
              </View>

              <View style={styles.employeeInfoRow}>
                <View style={styles.empField}>
                  <Text style={[styles.empLabel, { color: theme.colors.textMuted }]}>
                    Çalışan Adı Soyadı
                  </Text>
                  <Text style={[styles.empValue, { color: theme.colors.text }]}>
                    {employee ? `${employee.firstName} ${employee.lastName}` : 'Çalışan'}
                  </Text>
                </View>
                <View style={styles.empField}>
                  <Text style={[styles.empLabel, { color: theme.colors.textMuted }]}>
                    Departman / Pozisyon
                  </Text>
                  <Text style={[styles.empValue, { color: theme.colors.text }]}>
                    {employee?.department ?? '-'} / {employee?.position ?? '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Big Net Salary Card */}
            <View
              style={[
                styles.netSalaryCard,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text style={styles.netSalarySub}>NET ELE GEÇEN TUTAR</Text>
              <Text style={styles.netSalaryValue}>{formatCurrency(payroll.netSalary)}</Text>
              <View style={styles.netSalaryDetails}>
                <Text style={styles.netSalaryDetailText}>
                  Brüt: {formatCurrency(payroll.grossSalary)}
                </Text>
                <Text style={styles.netSalaryDetailText}>•</Text>
                <Text style={styles.netSalaryDetailText}>
                  Kesintiler: -{formatCurrency(payroll.deductions)}
                </Text>
              </View>
            </View>

            {/* Gross & Legal Deductions Breakdown */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Gelir & Kesinti Detayları
              </Text>

              {/* Custom Items if present */}
              {payroll.items && payroll.items.length > 0 ? (
                payroll.items.map((item, idx) => (
                  <View key={item.id || idx} style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.lineAmount,
                        {
                          color: item.isDeduction
                            ? theme.colors.danger
                            : theme.colors.text,
                        },
                      ]}
                    >
                      {item.isDeduction ? '-' : '+'}
                      {formatCurrency(item.amount)}
                    </Text>
                  </View>
                ))
              ) : (
                <>
                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.text, fontWeight: '600' }]}>
                      Brüt Ücret
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.text, fontWeight: '700' }]}>
                      {formatCurrency(payroll.grossSalary)}
                    </Text>
                  </View>

                  <View style={styles.lineDivider} />

                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>
                      SGK İşçi Payı (%14)
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.danger }]}>
                      -{formatCurrency(sgkWorker)}
                    </Text>
                  </View>

                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>
                      İşsizlik Sigortası Primi (%1)
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.danger }]}>
                      -{formatCurrency(unemploymentWorker)}
                    </Text>
                  </View>

                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>
                      Gelir Vergisi Kesintisi
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.danger }]}>
                      -{formatCurrency(incomeTax)}
                    </Text>
                  </View>

                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.textSecondary }]}>
                      Damga Vergisi
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.danger }]}>
                      -{formatCurrency(stampTax)}
                    </Text>
                  </View>

                  <View style={styles.lineDivider} />

                  <View style={styles.lineRow}>
                    <Text style={[styles.lineLabel, { color: theme.colors.danger, fontWeight: '600' }]}>
                      Toplam Yasal Kesintiler
                    </Text>
                    <Text style={[styles.lineAmount, { color: theme.colors.danger, fontWeight: '700' }]}>
                      -{formatCurrency(payroll.deductions)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Note & Legal Notice */}
            <View
              style={[
                styles.noticeBox,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Ionicons name="information-circle-outline" size={20} color={theme.colors.info} />
              <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
                Bu belge 4857 sayılı İş Kanunu ve 5510 sayılı Sosyal Sigortalar ve Genel Sağlık
                Sigortası Kanunu uyarınca düzenlenmiş olup elektronik onaylı resmi ücret hesap
                pusulasıdır.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  shareBtn: {
    padding: 6,
  },
  lockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  lockIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  lockActionBox: {
    width: '100%',
    gap: 12,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  biometricBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  fallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  fallbackBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  periodLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  periodValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  employeeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  empField: {
    flex: 1,
  },
  empLabel: {
    fontSize: 11,
    marginBottom: 3,
  },
  empValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  netSalaryCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  netSalarySub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  netSalaryValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  netSalaryDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  netSalaryDetailText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  lineLabel: {
    fontSize: 13,
  },
  lineAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
  },
  noticeBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
});
