import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldServiceJob,
  ServiceRequestItem,
  getServiceRequestById,
  addServiceItem,
} from '../../services/field-service.service';
import { formatCurrency } from '../../lib/utils';

export interface ServicePartsModalProps {
  visible: boolean;
  job: FieldServiceJob | null;
  onClose: () => void;
  onItemAdded?: () => void;
}

export const ServicePartsModal: React.FC<ServicePartsModalProps> = ({
  visible,
  job,
  onClose,
  onItemAdded,
}) => {
  const { theme } = useTheme();

  const [items, setItems] = useState<ServiceRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New item inputs
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');

  useEffect(() => {
    if (visible && job) {
      loadItems();
    }
  }, [visible, job]);

  const loadItems = async () => {
    if (!job) return;
    setIsLoading(true);
    try {
      const detail = await getServiceRequestById(job.id);
      setItems(detail.items || []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  if (!job) return null;

  const handleAddItem = async () => {
    if (!description.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen kullanılan parça veya işçilik açıklamasını girin.');
      return;
    }

    const qty = parseFloat(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      const created = await addServiceItem(job.id, {
        description: description.trim(),
        quantity: qty,
        unitPrice: price,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setItems((prev) => [...prev, created]);
      setDescription('');
      setQuantity('1');
      setUnitPrice('0');
      onItemAdded?.();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'Parça eklenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPartsAmount = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );

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
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Yedek Parça & İşçilik Girişi
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
              {job.number} • {job.contact?.name || 'Müşteri'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Add New Part Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Yeni Parça / İşçilik Ekle
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Malzeme veya İşçilik Tanımı *
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Örn: 24V Güç Kaynağı Değişimi, Rulman Takımı..."
                placeholderTextColor={theme.colors.textMuted}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View style={styles.twoColRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                  Kullanılan Miktar
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.borderSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="1"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                  Birim Fiyat (TL)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.borderSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              disabled={isSubmitting}
              onPress={handleAddItem}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={18} color="#ffffff" />
                  <Text style={styles.addBtnText}>Parçayı Servise Ekle</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Existing Items List */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <View style={styles.itemsHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                Kullanılan Parçalar ({items.length})
              </Text>
              <Text style={[styles.totalAmountText, { color: theme.colors.primary }]}>
                Toplam: {formatCurrency(totalPartsAmount)}
              </Text>
            </View>

            {isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
            ) : items.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Ionicons name="build-outline" size={32} color={theme.colors.textMuted} />
                <Text style={[styles.emptyItemsText, { color: theme.colors.textMuted }]}>
                  Bu servis için henüz parça veya işçilik eklenmedi.
                </Text>
              </View>
            ) : (
              items.map((item, idx) => (
                <View
                  key={item.id || idx}
                  style={[
                    styles.itemRow,
                    { borderBottomColor: theme.colors.borderSubtle },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.itemName, { color: theme.colors.text }]}>
                      {item.description}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
                      {item.quantity} Adet × {formatCurrency(item.unitPrice || 0)}
                    </Text>
                  </View>

                  <Text style={[styles.itemTotal, { color: theme.colors.text }]}>
                    {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 9,
    marginTop: 4,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalAmountText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyItemsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyItemsText: {
    fontSize: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '800',
  },
});
