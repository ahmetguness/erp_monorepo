import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  ExpenseCategory,
  ExpensePaymentMethod,
  CreateExpenseInput,
  createExpenseRecord,
  ExpenseRecord,
} from '../../services/finance.service';
import { formatCurrency } from '../../lib/utils';
import { CheckPhotoCaptureModal } from './CheckPhotoCaptureModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (expense: ExpenseRecord) => void;
  onSuccess?: () => void;
}

const CATEGORIES: Array<{
  key: ExpenseCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { key: 'FOOD', label: 'Yemek & İçecek', icon: 'restaurant-outline', color: '#f59e0b' },
  { key: 'FUEL', label: 'Akaryakıt & Benzin', icon: 'car-outline', color: '#ef4444' },
  { key: 'ACCOMMODATION', label: 'Konaklama / Otel', icon: 'bed-outline', color: '#8b5cf6' },
  { key: 'TRANSPORT', label: 'Ulaşım & Taksi', icon: 'bus-outline', color: '#06b6d4' },
  { key: 'HOSPITALITY', label: 'Temsil & Ağırlama', icon: 'cafe-outline', color: '#10b981' },
  { key: 'OFFICE', label: 'Ofis & Kırtasiye', icon: 'briefcase-outline', color: '#6366f1' },
  { key: 'OTHER', label: 'Diğer Masraf', icon: 'receipt-outline', color: '#64748b' },
];

export const CreateExpenseModal: React.FC<Props> = ({
  visible,
  onClose,
  onCreated,
  onSuccess,
}) => {
  const { theme } = useTheme();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('FOOD');
  const [amount, setAmount] = useState('');
  const [taxRate, setTaxRate] = useState<number>(20);
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('OUT_OF_POCKET');
  const [notes, setNotes] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | undefined>();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCategory('FOOD');
      setAmount('');
      setTaxRate(20);
      setPaymentMethod('OUT_OF_POCKET');
      setNotes('');
      setReceiptPhotoUri(undefined);
      setIsSubmitting(false);
    }
  }, [visible]);

  const numAmount = parseFloat(amount.replace(',', '.')) || 0;
  const taxAmount = (numAmount * taxRate) / 100;
  const totalAmount = numAmount + taxAmount;

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen masrafın konusunu/başlığını yazın.');
      return;
    }

    if (numAmount <= 0) {
      Alert.alert('Geçersiz Tutar', 'Lütfen sıfırdan büyük geçerli bir harcama tutarı girin.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const payload: CreateExpenseInput = {
        title: title.trim(),
        category,
        amount: numAmount,
        taxRate,
        paymentMethod,
        receiptPhotoUri,
        date: new Date().toISOString(),
        notes: notes.trim() || undefined,
      };

      const result = await createExpenseRecord(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Masraf Kaydedildi',
        `"${result.title}" harcamanız yöneticinizin onayına iletildi.`
      );
      if (onCreated) onCreated(result);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Masraf kaydı oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.colors.background }]}
          edges={['top', 'bottom']}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderBottomColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Yeni Masraf Fişi Girişi
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Saha harcama ve harcırahınızı fotoğraflayıp onaylatın
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Title / Subject */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                MASRAF BAŞLIĞI / AÇIKLAMA *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Örn: Müşteri Ziyareti Öğle Yemeği, Saha Akaryakıt..."
                placeholderTextColor={theme.colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Category Selector */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                MASRAF KATEGORİSİ
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {CATEGORIES.map((c) => {
                  const isSelected = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setCategory(c.key);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={c.icon}
                        size={15}
                        color={isSelected ? '#ffffff' : c.color}
                      />
                      <Text
                        style={[
                          styles.catChipText,
                          { color: isSelected ? '#ffffff' : theme.colors.text },
                        ]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Amount and KDV */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                TUTAR VE KDV ORANI
              </Text>

              <View style={styles.amountTaxRow}>
                <View style={{ flex: 1.6 }}>
                  <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                    Net Tutar (TL) *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        fontWeight: '700',
                      },
                    ]}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>

                <View style={{ flex: 1.4 }}>
                  <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                    KDV Oranı
                  </Text>
                  <View style={styles.taxRateRow}>
                    {[1, 10, 20].map((rate) => (
                      <TouchableOpacity
                        key={rate}
                        style={[
                          styles.taxChip,
                          {
                            backgroundColor: taxRate === rate ? theme.colors.primary : theme.colors.surface,
                            borderColor: taxRate === rate ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                        onPress={() => setTaxRate(rate)}
                      >
                        <Text
                          style={[
                            styles.taxChipText,
                            { color: taxRate === rate ? '#ffffff' : theme.colors.text },
                          ]}
                        >
                          %{rate}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Real-time Calculation Summary */}
              {numAmount > 0 && (
                <View style={[styles.calcBox, { backgroundColor: theme.colors.surface }]}>
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { color: theme.colors.textMuted }]}>
                      KDV Tutarı (%{taxRate}):
                    </Text>
                    <Text style={[styles.calcVal, { color: theme.colors.text }]}>
                      +{formatCurrency(taxAmount)}
                    </Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabelBold, { color: theme.colors.text }]}>
                      GENEL TOPLAM:
                    </Text>
                    <Text style={[styles.calcValBold, { color: theme.colors.primary }]}>
                      {formatCurrency(totalAmount)}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Payment Method (Şirket Kartı vs Personel Cebinden) */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                ÖDEME YÖNTEMİ
              </Text>

              <View style={styles.paymentMethodRow}>
                <TouchableOpacity
                  style={[
                    styles.paymentMethodChip,
                    {
                      backgroundColor:
                        paymentMethod === 'OUT_OF_POCKET' ? '#fef3c7' : theme.colors.surface,
                      borderColor:
                        paymentMethod === 'OUT_OF_POCKET' ? '#f59e0b' : theme.colors.border,
                    },
                  ]}
                  onPress={() => setPaymentMethod('OUT_OF_POCKET')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="wallet"
                    size={16}
                    color={paymentMethod === 'OUT_OF_POCKET' ? '#b45309' : theme.colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.paymentMethodTitle,
                        {
                          color:
                            paymentMethod === 'OUT_OF_POCKET' ? '#b45309' : theme.colors.text,
                        },
                      ]}
                    >
                      Kendi Cebimden
                    </Text>
                    <Text style={[styles.paymentMethodSub, { color: theme.colors.textMuted }]}>
                      Şirketten geri ödeme talep edilir
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentMethodChip,
                    {
                      backgroundColor:
                        paymentMethod === 'COMPANY_CARD' ? '#eff6ff' : theme.colors.surface,
                      borderColor:
                        paymentMethod === 'COMPANY_CARD' ? '#3b82f6' : theme.colors.border,
                    },
                  ]}
                  onPress={() => setPaymentMethod('COMPANY_CARD')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="card"
                    size={16}
                    color={paymentMethod === 'COMPANY_CARD' ? '#1d4ed8' : theme.colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.paymentMethodTitle,
                        {
                          color:
                            paymentMethod === 'COMPANY_CARD' ? '#1d4ed8' : theme.colors.text,
                        },
                      ]}
                    >
                      Şirket Kredi Kartı
                    </Text>
                    <Text style={[styles.paymentMethodSub, { color: theme.colors.textMuted }]}>
                      Şirket hesabı borçlandırılır
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Receipt Photo Capture */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.photoHeader}>
                <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                  FİŞ / FATURA GÖRSELİ
                </Text>
                <TouchableOpacity
                  style={[styles.cameraActionBtn, { backgroundColor: theme.colors.primaryMuted }]}
                  onPress={() => setIsCameraOpen(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera" size={14} color={theme.colors.primary} />
                  <Text style={[styles.cameraActionText, { color: theme.colors.primary }]}>
                    {receiptPhotoUri ? 'Yeniden Çek' : 'Fotoğraf Çek'}
                  </Text>
                </TouchableOpacity>
              </View>

              {receiptPhotoUri ? (
                <View style={styles.photoPreviewBox}>
                  <Image source={{ uri: receiptPhotoUri }} style={styles.receiptPreview} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setReceiptPhotoUri(undefined)}
                  >
                    <Ionicons name="trash" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.emptyPhotoBox, { borderColor: theme.colors.borderSubtle }]}
                  onPress={() => setIsCameraOpen(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyPhotoTitle, { color: theme.colors.text }]}>
                    Fiş veya Fatura Fotoğrafı Çekin
                  </Text>
                  <Text style={[styles.emptyPhotoSub, { color: theme.colors.textMuted }]}>
                    Yöneticinizin fişi denetlemesi için kamerayı açın
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Extra notes */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                NOTLAR & PROJE BİLGİSİ
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Görüşülen müşteri adı, proje kodu veya ek detay..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderTopColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: numAmount > 0 ? theme.colors.primary : theme.colors.borderSubtle,
                },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || numAmount <= 0}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Onaya Gönder</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Camera Capture Modal */}
      <CheckPhotoCaptureModal
        visible={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        initialFrontUri={receiptPhotoUri}
        onSavePhotos={(photos) => {
          if (photos.frontUri) {
            setReceiptPhotoUri(photos.frontUri);
          }
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  amountTaxRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  taxRateRow: {
    flexDirection: 'row',
    gap: 6,
  },
  taxChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  taxChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  calcBox: {
    padding: 10,
    borderRadius: 8,
    gap: 4,
    marginTop: 4,
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calcLabel: {
    fontSize: 11,
  },
  calcVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  calcLabelBold: {
    fontSize: 12,
    fontWeight: '800',
  },
  calcValBold: {
    fontSize: 15,
    fontWeight: '800',
  },
  paymentMethodRow: {
    gap: 8,
    marginTop: 4,
  },
  paymentMethodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  paymentMethodTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentMethodSub: {
    fontSize: 11,
    marginTop: 1,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cameraActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  photoPreviewBox: {
    position: 'relative',
    marginTop: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  receiptPreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPhotoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
    marginTop: 4,
  },
  emptyPhotoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyPhotoSub: {
    fontSize: 11,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 50,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
