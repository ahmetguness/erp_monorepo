import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  CheckPromissoryNote,
  CheckStatus,
  updateCheckPromissoryStatus,
  deleteCheckPromissoryNote,
} from '../../services/finance.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  visible: boolean;
  item: CheckPromissoryNote | null;
  onClose: () => void;
  onStatusUpdated?: (updated: CheckPromissoryNote) => void;
  onStatusChange?: (item: CheckPromissoryNote, nextStatus: CheckStatus) => void;
  onDeleted?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const STATUS_CONFIG: Record<
  CheckStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING: { label: 'Portföyde (Bekliyor)', variant: 'warning' },
  DEPOSITED: { label: 'Takasa Verildi', variant: 'info' },
  CLEARED: { label: 'Tahsil Edildi', variant: 'success' },
  BOUNCED: { label: 'Karşılıksız', variant: 'danger' },
  CANCELLED: { label: 'İptal Edildi', variant: 'neutral' },
};

export const CheckDetailModal: React.FC<Props> = ({
  visible,
  item,
  onClose,
  onStatusUpdated,
  onStatusChange,
  onDeleted,
  onDelete,
}) => {
  const { theme } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!item) return null;

  const cfg = STATUS_CONFIG[item.status] || { label: item.status, variant: 'neutral' as BadgeVariant };
  const isCheck = item.type === 'CHECK';

  // Extract photo URIs if embedded in notes
  let frontPhotoUri = item.frontPhotoUri;
  let backPhotoUri = item.backPhotoUri;
  if (!frontPhotoUri && item.notes && item.notes.includes('[PHOTOS:')) {
    const match = item.notes.match(/front=([^;]*); back=([^\]]*)/);
    if (match) {
      frontPhotoUri = match[1] || undefined;
      backPhotoUri = match[2] || undefined;
    }
  }
  const displayNotes = item.notes ? item.notes.replace(/\[PHOTOS:[^\]]*\]/g, '').trim() : '';

  const handleUpdateStatus = async (newStatus: CheckStatus, statusLabel: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'Durum Güncelleme',
      `Bu ${isCheck ? 'çeki' : 'senedi'} "${statusLabel}" olarak güncellemek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            setIsUpdating(true);
            try {
              const updated = await updateCheckPromissoryStatus(item.id, newStatus);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('Güncellendi', `Durum "${statusLabel}" olarak güncellendi.`);
              onStatusUpdated?.(updated);
              onStatusChange?.(updated, newStatus);
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.message || 'Durum güncellenemedi.');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Kaydı Sil',
      `"${item.number}" numaralı ${isCheck ? 'çek' : 'senet'} kaydını portföyden silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteCheckPromissoryNote(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('Silindi', 'Kayıt portföyden kaldırıldı.');
              onDeleted?.(item.id);
              onDelete?.(item.id);
              onClose();
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.message || 'Kayıt silinemedi.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {item.number}
              </Text>
              <Badge label={isCheck ? 'ÇEK' : 'SENET'} variant={isCheck ? 'info' : 'warning'} size="sm" />
              <Badge label={cfg.label} variant={cfg.variant} size="sm" />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Düzenleme: {formatDate(item.issueDate)} • Vade: {formatDate(item.dueDate)}
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
          {/* Amount Card */}
          <View
            style={[
              styles.amountCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>
              SENET / ÇEK TUTARI
            </Text>
            <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
              {formatCurrency(item.amount, item.currencyCode)}
            </Text>
          </View>

          {/* Details Card */}
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
              PORTFÖY BİLGİLERİ
            </Text>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Keşideci / Cari</Text>
              <Text style={[styles.detailVal, { color: theme.colors.text }]}>
                {item.contact?.name || 'Belirtilmedi'}
              </Text>
            </View>

            {item.bankName && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Banka Adı</Text>
                <Text style={[styles.detailVal, { color: theme.colors.text }]}>
                  {item.bankName}
                </Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Vade Tarihi</Text>
              <Text style={[styles.detailVal, { color: theme.colors.text, fontWeight: '700' }]}>
                {formatDate(item.dueDate)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Düzenleme Tarihi</Text>
              <Text style={[styles.detailVal, { color: theme.colors.text }]}>
                {formatDate(item.issueDate)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Durum</Text>
              <Badge label={cfg.label} variant={cfg.variant} size="sm" />
            </View>
          </View>

          {/* Photos Card (if any) */}
          {(frontPhotoUri || backPhotoUri) && (
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
                ÇEK / SENET GÖRSELLERİ
              </Text>

              <View style={styles.photosRow}>
                {frontPhotoUri && (
                  <View style={styles.photoCol}>
                    <Text style={[styles.photoLabel, { color: theme.colors.textMuted }]}>
                      Ön Yüz
                    </Text>
                    <Image source={{ uri: frontPhotoUri }} style={styles.photoThumb} resizeMode="cover" />
                  </View>
                )}

                {backPhotoUri && (
                  <View style={styles.photoCol}>
                    <Text style={[styles.photoLabel, { color: theme.colors.textMuted }]}>
                      Arka Yüz (Ciro)
                    </Text>
                    <Image source={{ uri: backPhotoUri }} style={styles.photoThumb} resizeMode="cover" />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Notes Card */}
          {Boolean(displayNotes) && (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>NOTLAR</Text>
              <Text style={[styles.notesText, { color: theme.colors.textSecondary }]}>
                {displayNotes}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer State Machine Transitions */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <>
              {item.status === 'PENDING' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#3b82f6' }]}
                    onPress={() => handleUpdateStatus('DEPOSITED', 'Takasa Verildi')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="swap-horizontal" size={16} color="#2563eb" />
                    <Text style={[styles.actionBtnText, { color: '#2563eb' }]}>Takasa Ver</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
                    onPress={() => handleUpdateStatus('CANCELLED', 'İptal Edildi')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle" size={16} color="#b91c1c" />
                    <Text style={[styles.actionBtnText, { color: '#b91c1c' }]}>İptal Et</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconDeleteBtn, { borderColor: theme.colors.danger }]}
                    onPress={handleDelete}
                    disabled={isDeleting}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                  </TouchableOpacity>
                </>
              )}

              {item.status === 'DEPOSITED' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#ecfdf5', borderColor: '#10b981', flex: 1 }]}
                    onPress={() => handleUpdateStatus('CLEARED', 'Tahsil Edildi')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-done" size={16} color="#059669" />
                    <Text style={[styles.actionBtnText, { color: '#059669' }]}>Tahsil Edildi (Hesaba Geçti)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
                    onPress={() => handleUpdateStatus('BOUNCED', 'Karşılıksız')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                    <Text style={[styles.actionBtnText, { color: '#b91c1c' }]}>Karşılıksız</Text>
                  </TouchableOpacity>
                </>
              )}

              {(item.status === 'CLEARED' || item.status === 'BOUNCED' || item.status === 'CANCELLED') && (
                <View style={styles.closedStateWrap}>
                  <Ionicons
                    name={item.status === 'CLEARED' ? 'checkmark-circle' : 'information-circle'}
                    size={20}
                    color={item.status === 'CLEARED' ? '#10b981' : theme.colors.textMuted}
                  />
                  <Text style={[styles.closedStateText, { color: theme.colors.textSecondary }]}>
                    Bu kayıt sonlanmış durumdadır ({cfg.label}).
                  </Text>
                </View>
              )}
            </>
          )}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  amountCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailKey: {
    fontSize: 13,
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  photosRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  photoCol: {
    flex: 1,
    gap: 4,
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  photoThumb: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  iconDeleteBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedStateWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  closedStateText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
