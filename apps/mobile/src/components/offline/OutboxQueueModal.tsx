import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  selectOutboxMutations,
  selectIsSyncingQueue,
  selectIsOnline,
  removeMutation,
  setMutationStatus,
  clearAllMutations,
  setActiveConflictMutationId,
  OutboxMutation,
} from '../../store/redux';

interface OutboxQueueModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenConflict: (mutationId: string) => void;
}

export const OutboxQueueModal: React.FC<OutboxQueueModalProps> = ({
  visible,
  onClose,
  onOpenConflict,
}) => {
  const dispatch = useAppDispatch();
  const mutations = useAppSelector(selectOutboxMutations);
  const isSyncing = useAppSelector(selectIsSyncingQueue);
  const isOnline = useAppSelector(selectIsOnline);

  const handleSyncAll = () => {
    if (!isOnline) {
      Alert.alert(
        'Çevrimdışı Mod',
        'Cihazınızda internet bağlantısı bulunmuyor. Bağlantı kurulduğunda işlemler otomatik olarak sunucuya aktarılacaktır.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Trigger retry on any FAILED mutations
    mutations.forEach((m) => {
      if (m.status === 'FAILED') {
        dispatch(
          setMutationStatus({
            id: m.id,
            status: 'QUEUED',
          })
        );
      }
    });
  };

  const handleClearAll = () => {
    Alert.alert(
      'Kuyruğu Temizle',
      'Kuyruktaki tüm çevrimdışı işlemler silinecektir. Bu işlem geri alınamaz. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            dispatch(clearAllMutations());
          },
        },
      ]
    );
  };

  const renderStatusBadge = (mutation: OutboxMutation) => {
    switch (mutation.status) {
      case 'QUEUED':
        return (
          <View style={[styles.badge, styles.queuedBadge]}>
            <Ionicons name="time-outline" size={12} color="#FBBF24" />
            <Text style={[styles.badgeText, styles.queuedBadgeText]}>Sırada</Text>
          </View>
        );
      case 'SYNCING':
        return (
          <View style={[styles.badge, styles.syncingBadge]}>
            <ActivityIndicator size="small" color="#38BDF8" style={{ transform: [{ scale: 0.7 }] }} />
            <Text style={[styles.badgeText, styles.syncingBadgeText]}>Eşitleniyor</Text>
          </View>
        );
      case 'RESOLVED_CONFLICT':
        return (
          <TouchableOpacity
            style={[styles.badge, styles.conflictBadge]}
            onPress={() => {
              dispatch(setActiveConflictMutationId(mutation.id));
              onOpenConflict(mutation.id);
            }}
          >
            <Ionicons name="warning-outline" size={12} color="#EF4444" />
            <Text style={[styles.badgeText, styles.conflictBadgeText]}>Çakışma (İncele)</Text>
          </TouchableOpacity>
        );
      case 'FAILED':
        return (
          <View style={[styles.badge, styles.failedBadge]}>
            <Ionicons name="close-circle-outline" size={12} color="#EF4444" />
            <Text style={[styles.badgeText, styles.failedBadgeText]}>Başarısız</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderItem = ({ item }: { item: OutboxMutation }) => {
    const formattedDate = new Date(item.createdAt).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemTopRow}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {renderStatusBadge(item)}
        </View>

        <View style={styles.itemMetaRow}>
          <Text style={styles.itemMeta}>Kayıt: {formattedDate}</Text>
          {item.retryCount > 0 && (
            <Text style={styles.itemMeta}>• {item.retryCount} kez denendi</Text>
          )}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              dispatch(removeMutation(item.id));
            }}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>

        {item.lastError && item.status !== 'RESOLVED_CONFLICT' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} numberOfLines={2}>
              {item.lastError}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="layers-outline" size={20} color="#0EA5E9" />
              </View>
              <View>
                <Text style={styles.title}>Çevrimdışı İşlem Kuyruğu</Text>
                <Text style={styles.subtitle}>
                  {mutations.length} işlem • {isOnline ? 'Ağ Aktif' : 'Çevrimdışı'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <FlatList
            data={mutations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color="#10B981" />
                <Text style={styles.emptyTitle}>Kuyruk Temiz</Text>
                <Text style={styles.emptySubtitle}>
                  Bekleyen çevrimdışı işlem bulunmuyor. Yapılan tüm değişiklikler sunucu ile senkronize durumda.
                </Text>
              </View>
            }
          />

          {/* Footer Controls */}
          {mutations.length > 0 && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearAll}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                <Text style={styles.clearBtnText}>Tümünü Sil</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
                onPress={handleSyncAll}
                disabled={isSyncing}
                activeOpacity={0.8}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={styles.syncBtnText}>Şimdi Eşitle</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '85%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  queuedBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  queuedBadgeText: {
    color: '#FBBF24',
  },
  syncingBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  syncingBadgeText: {
    color: '#38BDF8',
  },
  conflictBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  conflictBadgeText: {
    color: '#EF4444',
  },
  failedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  failedBadgeText: {
    color: '#EF4444',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemMeta: {
    fontSize: 11.5,
    color: '#64748B',
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 6,
    padding: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    fontSize: 11,
    color: '#FCA5A5',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  clearBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  clearBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  syncBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0EA5E9',
    borderRadius: 14,
    paddingVertical: 13,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
