import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ApprovalRequest } from '../../services/approval.service';
import { Badge, BadgeVariant } from '../common/Badge';
import { formatCurrency, formatDateTime } from '../../lib/utils';

export interface ApprovalDetailModalProps {
  visible: boolean;
  request: ApprovalRequest | null;
  isActing?: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (request: ApprovalRequest) => void;
}

function getStatusBadge(status: ApprovalRequest['status']): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: 'Bekliyor', variant: 'warning' };
    case 'APPROVED':
      return { label: 'Onaylandı', variant: 'success' };
    case 'REJECTED':
      return { label: 'Reddedildi', variant: 'danger' };
    case 'CANCELLED':
      return { label: 'İptal', variant: 'neutral' };
    case 'ESCALATED':
      return { label: 'Yükseltildi', variant: 'info' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  visible,
  request,
  isActing = false,
  onClose,
  onApprove,
  onReject,
}) => {
  const { theme } = useTheme();

  if (!request) return null;

  const statusBadge = getStatusBadge(request.status);
  const amount = request.context?.amount;
  const department = request.context?.department;
  const docType = request.context?.documentType;
  const steps = request.flow?.steps || [];
  const actions = request.actions || [];

  const handleApprove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onApprove(request.id);
  };

  const handleReject = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReject(request);
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
        {/* Top Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderBottomColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {request.flow?.name || 'Onay Talebi'}
            </Text>
            <Badge label={statusBadge.label} variant={statusBadge.variant} size="sm" />
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.closeBtn,
              { backgroundColor: theme.colors.borderSubtle },
            ]}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Content Scroll */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Amount Highlight Card if present */}
          {amount !== null && amount !== undefined && amount > 0 && (
            <View
              style={[
                styles.amountCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.primary,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>
                TALEP TUTARI
              </Text>
              <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
                {formatCurrency(amount)}
              </Text>
            </View>
          )}

          {/* Section: General Info */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Genel Bilgiler
            </Text>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Talep Eden</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {request.requestedBy || 'Belirtilmedi'}
              </Text>
            </View>

            {department && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Departman</Text>
                <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                  {department}
                </Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Varlık Tipi</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {docType || request.entityType}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Kayıt No / ID</Text>
              <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {request.entityId}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Talep Tarihi</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {formatDateTime(request.createdAt)}
              </Text>
            </View>
          </View>

          {/* Section: Notes / Justification */}
          {request.notes && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Gerekçe / Açıklama
              </Text>
              <Text style={[styles.notesText, { color: theme.colors.textSecondary }]}>
                {request.notes}
              </Text>
            </View>
          )}

          {/* Section: Steps Timeline */}
          {steps.length > 0 && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Onay Adımları
              </Text>

              {steps.map((step, idx) => {
                const isCompleted = step.stepOrder < request.currentStep || request.status === 'APPROVED';
                const isCurrent = step.stepOrder === request.currentStep && request.status === 'PENDING';
                const isLast = idx === steps.length - 1;

                return (
                  <View key={step.id} style={styles.stepItem}>
                    <View style={styles.stepIndicatorCol}>
                      <View
                        style={[
                          styles.stepDot,
                          {
                            backgroundColor: isCompleted
                              ? theme.colors.success
                              : isCurrent
                              ? theme.colors.warning
                              : theme.colors.borderSubtle,
                          },
                        ]}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={12} color="#ffffff" />
                        ) : (
                          <Text
                            style={[
                              styles.stepNumber,
                              {
                                color: isCurrent ? '#ffffff' : theme.colors.textMuted,
                              },
                            ]}
                          >
                            {step.stepOrder}
                          </Text>
                        )}
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.stepLine,
                            {
                              backgroundColor: isCompleted
                                ? theme.colors.success
                                : theme.colors.borderSubtle,
                            },
                          ]}
                        />
                      )}
                    </View>

                    <View style={styles.stepContent}>
                      <Text
                        style={[
                          styles.stepName,
                          {
                            color: theme.colors.text,
                            fontWeight: isCurrent ? '700' : '500',
                          },
                        ]}
                      >
                        {step.name}
                      </Text>
                      <Text style={[styles.stepApprover, { color: theme.colors.textMuted }]}>
                        Onaycı: {step.approverRole?.name || step.approverUser?.name || 'Yetkili Yönetici'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Section: Action History */}
          {actions.length > 0 && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                İşlem Tarihçesi
              </Text>

              {actions.map((act) => (
                <View
                  key={act.id}
                  style={[
                    styles.historyRow,
                    { borderBottomColor: theme.colors.borderSubtle },
                  ]}
                >
                  <View style={styles.historyHeader}>
                    <Badge
                      label={act.actionType === 'APPROVE' ? 'Onaylandı' : act.actionType === 'REJECT' ? 'Reddedildi' : act.actionType}
                      variant={act.actionType === 'APPROVE' ? 'success' : act.actionType === 'REJECT' ? 'danger' : 'neutral'}
                      size="sm"
                    />
                    <Text style={[styles.historyDate, { color: theme.colors.textMuted }]}>
                      {formatDateTime(act.createdAt)}
                    </Text>
                  </View>
                  {act.notes && (
                    <Text style={[styles.historyNotes, { color: theme.colors.textSecondary }]}>
                      "{act.notes}"
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom Sticky Action Buttons if PENDING */}
        {request.status === 'PENDING' && (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderTopColor: theme.colors.borderSubtle,
                ...theme.shadows.md,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isActing}
              onPress={handleReject}
              style={[
                styles.footerBtn,
                styles.rejectFooterBtn,
                {
                  backgroundColor: theme.colors.dangerMuted,
                  borderColor: theme.colors.danger,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
              <Text style={[styles.footerBtnText, { color: theme.colors.danger }]}>
                Reddet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isActing}
              onPress={handleApprove}
              style={[
                styles.footerBtn,
                styles.approveFooterBtn,
                {
                  backgroundColor: theme.colors.success,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              {isActing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                  <Text style={[styles.footerBtnText, { color: '#ffffff' }]}>
                    Onayla (1-Tap)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    maxWidth: '65%',
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
    paddingBottom: 24,
  },
  amountCard: {
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sectionCard: {
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 24,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepLine: {
    width: 2,
    height: 24,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
    paddingTop: 1,
    gap: 2,
  },
  stepName: {
    fontSize: 14,
  },
  stepApprover: {
    fontSize: 11,
  },
  historyRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyDate: {
    fontSize: 11,
  },
  historyNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
  },
  rejectFooterBtn: {
    borderWidth: 1,
  },
  approveFooterBtn: {},
  footerBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
