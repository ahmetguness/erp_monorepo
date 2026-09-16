import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  selectActiveConflictMutation,
  resolveConflict,
  setActiveConflictMutationId,
} from '../../store/redux';

interface ConflictResolutionModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  visible,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const conflictMutation = useAppSelector(selectActiveConflictMutation);

  if (!conflictMutation) return null;

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    dispatch(
      resolveConflict({
        id: conflictMutation.id,
        action: 'retry',
      })
    );
    onClose();
  };

  const handleDiscard = () => {
    Alert.alert(
      'İşlemi İptal Et',
      'Bu çevrimdışı işlem sunucuya aktarılmadan kuyruktan silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et ve Sil',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            dispatch(
              resolveConflict({
                id: conflictMutation.id,
                action: 'discard',
              })
            );
            onClose();
          },
        },
      ]
    );
  };

  const formattedTime = new Date(conflictMutation.createdAt).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'numeric',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.alertIconWrap}>
                <Ionicons name="warning" size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={styles.title}>Senkronizasyon Çakışması</Text>
                <Text style={styles.subtitle}>Sunucu ile yerel veri uyuşmazlığı</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Mutation Info */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>İŞLEM DETAYI</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>İşlem Adı:</Text>
                <Text style={styles.infoValue}>{conflictMutation.title}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Kayıt Zamanı:</Text>
                <Text style={styles.infoValue}>{formattedTime}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Deneme Sayısı:</Text>
                <Text style={styles.infoValue}>{conflictMutation.retryCount} kez</Text>
              </View>
            </View>

            {/* Conflict Reason */}
            <View style={[styles.sectionCard, styles.errorCard]}>
              <View style={styles.errorHeader}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                <Text style={styles.errorTitle}>ÇAKIŞMA NEDENİ</Text>
              </View>
              <Text style={styles.errorDescription}>
                {conflictMutation.conflictData?.conflictReason ||
                  conflictMutation.lastError ||
                  'Sunucu verileri ile yerel işlem arasında çakışma oluştu.'}
              </Text>
            </View>

            {/* Technical Payload Preview */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>YEREL VERİ ÖZETİ</Text>
              <View style={styles.codeWrap}>
                <Text style={styles.codeText} numberOfLines={8}>
                  {JSON.stringify(conflictMutation.payload, null, 2)}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={handleDiscard}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={styles.discardButtonText}>İşlemi İptal Et</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Yeniden Dene</Text>
            </TouchableOpacity>
          </View>
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
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
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
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  errorTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.6,
  },
  errorDescription: {
    fontSize: 13,
    color: '#FCA5A5',
    lineHeight: 19,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoKey: {
    fontSize: 13,
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  codeWrap: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: '#334155',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94A3B8',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  discardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    paddingVertical: 13,
  },
  discardButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  retryButton: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0EA5E9',
    borderRadius: 14,
    paddingVertical: 13,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
