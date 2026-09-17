// apps/mobile/src/features/approvals/components/ApprovalInspectionPane.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { ApprovalRequest, ApprovalModule } from '../../../services/approval.service';
import { Badge, BadgeVariant } from '../../../components/common/Badge';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { formatCurrency, formatDateTime } from '../../../lib/utils';

export interface ApprovalInspectionPaneProps {
  request: ApprovalRequest | null;
  isActing?: boolean;
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

function getModuleTitle(module: ApprovalModule): string {
  switch (module) {
    case 'PURCHASE_REQUEST':
    case 'PURCHASE_ORDER':
      return 'Satın Alma Talebi';
    case 'SALES_ORDER':
      return 'Satış Siparişi';
    case 'INVOICE':
      return 'Fatura & İskonto';
    case 'LEAVE_REQUEST':
      return 'İzin Talebi';
    case 'SERVICE_REQUEST':
      return 'Teknik Servis Onayı';
    default:
      return module;
  }
}

export const ApprovalInspectionPane: React.FC<ApprovalInspectionPaneProps> = ({
  request,
  isActing = false,
  onApprove,
  onReject,
}) => {
  const { theme } = useTheme();

  if (!request) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
        <View style={[styles.emptyIconBg, { backgroundColor: theme.colors.surface1 }]}>
          <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
          Talep Seçilmedi
        </Text>
        <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
          Detaylı evrak kalemlerini, onay adımlarını ve karar butonlarını görüntülemek için sol
          panelden bir talep seçin.
        </Text>
      </View>
    );
  }

  const isPending = request.status === 'PENDING';
  const statusBadge = getStatusBadge(request.status);
  const amount = request.context?.amount;
  const department = request.context?.department;
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
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface0,
          borderColor: theme.colors.glassBorder,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Badges & Module */}
        <View style={styles.headerRow}>
          <View style={styles.badgeGroup}>
            <Badge
              label={getModuleTitle(request.flow?.module || 'OTHER')}
              variant="primary"
              size="sm"
            />
            <Badge
              label={statusBadge.label}
              variant={statusBadge.variant}
              size="sm"
              pulse={isPending}
            />
          </View>
          <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>
            {formatDateTime(request.createdAt)}
          </Text>
        </View>

        {/* Request Title */}
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          {request.flow?.name || 'Onay Talebi'}
        </Text>

        {/* Amount Hero Card (if applicable) */}
        {typeof amount === 'number' && (
          <View
            style={[
              styles.amountCard,
              {
                backgroundColor: theme.colors.surface1,
                borderColor: theme.colors.glassBorder,
              },
            ]}
          >
            <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}>
              ONAYA SUNULAN TUTAR
            </Text>
            <TabularText style={[styles.amountValue, { color: theme.colors.textPrimary }]}>
              {formatCurrency(amount)}
            </TabularText>
          </View>
        )}

        {/* Metadata Details Grid */}
        <View
          style={[
            styles.metaGrid,
            {
              backgroundColor: theme.colors.surface1,
              borderColor: theme.colors.glassBorder,
            },
          ]}
        >
          {request.requestedBy && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaKey, { color: theme.colors.textMuted }]}>Talep Eden:</Text>
              <Text style={[styles.metaVal, { color: theme.colors.textPrimary }]}>
                {request.requestedBy}
              </Text>
            </View>
          )}

          {department && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaKey, { color: theme.colors.textMuted }]}>Departman:</Text>
              <Text style={[styles.metaVal, { color: theme.colors.textPrimary }]}>
                {department}
              </Text>
            </View>
          )}

          {request.notes && (
            <View style={[styles.metaRow, { flexDirection: 'column', gap: 4 }]}>
              <Text style={[styles.metaKey, { color: theme.colors.textMuted }]}>Açıklama & Gerekçe:</Text>
              <Text style={[styles.metaVal, { color: theme.colors.textPrimary }]}>
                {request.notes}
              </Text>
            </View>
          )}
        </View>

        {/* Approval Flow Steps Timeline */}
        {steps.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              Onay Hiyerarşisi ({steps.length} Adım)
            </Text>
            <View style={styles.stepsTimeline}>
              {steps.map((step, idx) => (
                <View key={step.id || idx} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor:
                          idx < (request.currentStep || 0)
                            ? theme.colors.emeraldNeon
                            : idx === (request.currentStep || 0)
                            ? theme.colors.primary
                            : theme.colors.surface2,
                      },
                    ]}
                  >
                    <Text style={styles.stepNum}>{idx + 1}</Text>
                  </View>
                  <View style={styles.stepInfo}>
                    <Text style={[styles.stepName, { color: theme.colors.textPrimary }]}>
                      {step.name || `Adım ${idx + 1}`}
                    </Text>
                    {step.approverRole?.name && (
                      <Text style={[styles.stepRole, { color: theme.colors.textMuted }]}>
                        {step.approverRole.name}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Audit Actions History */}
        {actions.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              İşlem Geçmişi ({actions.length})
            </Text>
            {actions.map((act, i) => (
              <View
                key={act.id || i}
                style={[
                  styles.actionItem,
                  {
                    backgroundColor: theme.colors.surface1,
                    borderColor: theme.colors.glassBorder,
                  },
                ]}
              >
                <View style={styles.actionHeader}>
                  <Badge
                    label={act.actionType}
                    variant={act.actionType === 'APPROVE' ? 'success' : 'danger'}
                    size="sm"
                  />
                  <Text style={[styles.actionDate, { color: theme.colors.textMuted }]}>
                    {formatDateTime(act.createdAt)}
                  </Text>
                </View>
                {act.notes && (
                  <Text style={[styles.actionComment, { color: theme.colors.textSecondary }]}>
                    &quot;{act.notes}&quot;
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Action Buttons (if PENDING) */}
      {isPending && (
        <View
          style={[
            styles.bottomStickyBar,
            {
              backgroundColor: theme.colors.surface1,
              borderTopColor: theme.colors.glassBorder,
            },
          ]}
        >
          <SpringPressable
            onPress={handleReject}
            disabled={isActing}
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                borderColor: theme.colors.crimsonLaser,
              },
            ]}
          >
            <Ionicons name="close-circle-outline" size={18} color={theme.colors.crimsonLaser} />
            <Text style={[styles.actionBtnText, { color: theme.colors.crimsonLaser }]}>
              Reddet
            </Text>
          </SpringPressable>

          <SpringPressable
            onPress={handleApprove}
            disabled={isActing}
            style={[
              styles.actionBtn,
              styles.approveBtn,
              {
                backgroundColor: theme.colors.emeraldNeon,
              },
            ]}
          >
            {isActing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                  Talebi Onayla
                </Text>
              </>
            )}
          </SpringPressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  scrollContent: {
    padding: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderWidth: 1,
    borderRadius: 20,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 16,
    lineHeight: 28,
  },
  amountCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metaGrid: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: 12,
    fontWeight: '500',
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  stepsTimeline: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepInfo: {
    flex: 1,
  },
  stepName: {
    fontSize: 13,
    fontWeight: '600',
  },
  stepRole: {
    fontSize: 11,
  },
  actionItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionDate: {
    fontSize: 11,
  },
  actionComment: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  bottomStickyBar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rejectBtn: {
    borderWidth: 1,
  },
  approveBtn: {},
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
