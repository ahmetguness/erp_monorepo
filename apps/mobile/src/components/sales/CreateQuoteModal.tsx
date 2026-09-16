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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppSelector } from '../../store/redux';
import {
  selectCartContact,
  selectCartItemsList,
  selectCartTotals,
} from '../../store/redux/cartOrderSlice';
import {
  createSalesQuote,
  SalesQuote,
} from '../../services/sales.service';
import { formatCurrency } from '../../lib/utils';

interface Props {
  visible: boolean;
  onClose: () => void;
  onQuoteCreated: (quote: SalesQuote) => void;
}

const VALIDITY_OPTIONS = [
  { label: '7 Gün', days: 7 },
  { label: '15 Gün', days: 15 },
  { label: '30 Gün', days: 30 },
  { label: '60 Gün', days: 60 },
];

export const CreateQuoteModal: React.FC<Props> = ({
  visible,
  onClose,
  onQuoteCreated,
}) => {
  const { theme } = useTheme();
  const cartContact = useAppSelector(selectCartContact);
  const cartItems = useAppSelector(selectCartItemsList);
  const cartTotals = useAppSelector(selectCartTotals);

  const [selectedValidityDays, setSelectedValidityDays] = useState(15);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedValidityDays(15);
      setNotes('');
      setIsSubmitting(false);
    }
  }, [visible]);

  // Calculate valid until date string
  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + selectedValidityDays);

  const handleCreate = async () => {
    if (!cartContact) {
      Alert.alert('Müşteri Seçilmedi', 'Lütfen önce Müşteri 360 sekmesinden bir müşteri seçin.');
      return;
    }

    if (cartItems.length === 0) {
      Alert.alert(
        'Kalem Yok',
        'Teklif oluşturmak için sepete en az 1 ürün eklemelisiniz. Katalogdan ürün ekleyip tekrar deneyin.'
      );
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const quote = await createSalesQuote({
        contactId: cartContact.id,
        date: new Date().toISOString(),
        validUntil: validUntilDate.toISOString(),
        notes: notes.trim() || undefined,
        items: cartItems.map((item) => ({
          productId: item.productId,
          description: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxRate: item.taxRate,
        })),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Teklif Oluşturuldu', `"${quote.number}" numaralı satış teklifi başarıyla kaydedildi.`);
      onQuoteCreated(quote);
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Teklif kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
              Yeni Satış Teklifi Hazırla
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Mevcut sepet kalemleri teklife aktarılır
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
          {/* Customer Selection Card */}
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
              TEKLİF VERİLECEK MÜŞTERİ
            </Text>

            {cartContact ? (
              <View style={styles.contactRow}>
                <View style={[styles.contactAvatar, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="business" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactName, { color: theme.colors.text }]}>
                    {cartContact.name}
                  </Text>
                  {cartContact.phone && (
                    <Text style={[styles.contactSub, { color: theme.colors.textMuted }]}>
                      {cartContact.phone}
                    </Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              </View>
            ) : (
              <View style={styles.noContactBox}>
                <Ionicons name="alert-circle-outline" size={22} color="#f59e0b" />
                <Text style={[styles.noContactText, { color: theme.colors.textSecondary }]}>
                  Müşteri seçilmedi. Lütfen Müşteri 360 sekmesinden bir müşteri seçin.
                </Text>
              </View>
            )}
          </View>

          {/* Items Summary Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.itemsHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                TEKLİF KALEMLERİ ({cartItems.length})
              </Text>
              <Text style={[styles.itemsTotal, { color: theme.colors.primary }]}>
                {formatCurrency(cartTotals.grandTotal)}
              </Text>
            </View>

            {cartItems.length > 0 ? (
              cartItems.map((item, idx) => (
                <View
                  key={item.productId}
                  style={[
                    styles.itemLine,
                    {
                      borderBottomColor: theme.colors.borderSubtle,
                      borderBottomWidth: idx === cartItems.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.itemSub, { color: theme.colors.textMuted }]}>
                      {item.quantity} Adet x {formatCurrency(item.unitPrice)}
                    </Text>
                  </View>
                  <Text style={[styles.itemLineTotal, { color: theme.colors.text }]}>
                    {formatCurrency(item.quantity * item.unitPrice * (1 - item.discount / 100))}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyItemsText, { color: theme.colors.textMuted }]}>
                Sepetinizde ürün bulunmuyor. Teklife dönüştürmek için önce sepete ürün ekleyin.
              </Text>
            )}
          </View>

          {/* Validity Duration */}
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
              TEKLİF GEÇERLİLİK SÜRESİ
            </Text>

            <View style={styles.chipsRow}>
              {VALIDITY_OPTIONS.map((opt) => {
                const isSelected = selectedValidityDays === opt.days;
                return (
                  <TouchableOpacity
                    key={opt.days}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.surface,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedValidityDays(opt.days);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? '#ffffff' : theme.colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.validityNotice, { color: theme.colors.textMuted }]}>
              Son Geçerlilik: {validUntilDate.toLocaleDateString('tr-TR')}
            </Text>
          </View>

          {/* Notes & Special Terms */}
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
              TEKLİF NOTLARI & ÖZEL ŞARTLAR
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Örn: Fiyatlara KDV dahildir. Teslim süresi 3 iş günüdür."
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
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
                backgroundColor:
                  !cartContact || cartItems.length === 0
                    ? theme.colors.borderSubtle
                    : theme.colors.primary,
              },
            ]}
            onPress={handleCreate}
            disabled={isSubmitting || !cartContact || cartItems.length === 0}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Teklifi Kaydet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
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
    fontSize: 12,
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
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700',
  },
  contactSub: {
    fontSize: 12,
    marginTop: 2,
  },
  noContactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  noContactText: {
    fontSize: 12,
    flex: 1,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsTotal: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  itemLineTotal: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyItemsText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  validityNotice: {
    fontSize: 11,
    marginTop: 4,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
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
