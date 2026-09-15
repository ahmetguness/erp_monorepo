import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import {
  useApprovalStore,
} from '../store/approval.store';
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalModule,
} from '../services/approval.service';
import {
  ApprovalCard,
  ApprovalDetailModal,
  RejectionReasonModal,
  BatchActionBar,
} from '../components/approvals';
import { EmptyState } from '../components/common';

interface StatusFilterTab {
  key: ApprovalStatus | 'ALL';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const STATUS_TABS: StatusFilterTab[] = [
  { key: 'PENDING', label: 'Bekleyenler', icon: 'hourglass-outline' },
  { key: 'APPROVED', label: 'Onaylananlar', icon: 'checkmark-circle-outline' },
  { key: 'REJECTED', label: 'Reddedilenler', icon: 'close-circle-outline' },
  { key: 'ALL', label: 'Tümü', icon: 'list-outline' },
];

interface ModuleFilterChip {
  key: ApprovalModule | 'ALL';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const MODULE_CHIPS: ModuleFilterChip[] = [
  { key: 'ALL', label: 'Tüm Modüller', icon: 'apps-outline' },
  { key: 'PURCHASE_REQUEST', label: 'Satın Alma', icon: 'bag-check-outline' },
  { key: 'SALES_ORDER', label: 'Satış Siparişi', icon: 'cart-outline' },
  { key: 'INVOICE', label: 'Fatura İskonto', icon: 'receipt-outline' },
  { key: 'LEAVE_REQUEST', label: 'İzin Talebi', icon: 'calendar-outline' },
  { key: 'SERVICE_REQUEST', label: 'Servis Talebi', icon: 'construct-outline' },
];

export default function ApprovalsScreen() {
  const { theme } = useTheme();

  const {
    requests,
    total,
    isLoading,
    isActing,
    error,
    filterStatus,
    selectedModule,
    selectedIds,
    isSelectionMode,
    loadRequests,
    loadRequestDetails,
    approveRequest,
    rejectRequest,
    batchExecute,
    toggleSelection,
    selectAll,
    clearSelection,
    setSelectionMode,
    setFilterStatus,
    setSelectedModule,
  } = useApprovalStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [requestToReject, setRequestToReject] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await loadRequests();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadRequests]);

  // Filter requests by module locally
  const filteredRequests = useMemo(() => {
    if (selectedModule === 'ALL') return requests;
    return requests.filter((r) => r.flow.module === selectedModule);
  }, [requests, selectedModule]);

  // Pending count across loaded requests
  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === 'PENDING').length;
  }, [requests]);

  // Open detail modal
  const handleOpenDetail = useCallback(
    async (req: ApprovalRequest) => {
      setSelectedRequest(req);
      setDetailModalVisible(true);
      // Fetch full details in background (steps, history, actor)
      const full = await loadRequestDetails(req.id);
      if (full) {
        setSelectedRequest(full);
      }
    },
    [loadRequestDetails]
  );

  // 1-Tap approve
  const handleApprove = useCallback(
    async (id: string) => {
      const success = await approveRequest(id);
      if (success && selectedRequest?.id === id) {
        setSelectedRequest((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
      }
    },
    [approveRequest, selectedRequest]
  );

  // Open reject modal
  const handleRejectPrompt = useCallback((req: ApprovalRequest) => {
    setRequestToReject(req);
    setRejectionModalVisible(true);
  }, []);

  // Confirm rejection
  const handleConfirmReject = useCallback(
    async (id: string, reason: string) => {
      const success = await rejectRequest(id, reason);
      if (success) {
        setRejectionModalVisible(false);
        setRequestToReject(null);
        if (selectedRequest?.id === id) {
          setSelectedRequest((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
        }
      }
    },
    [rejectRequest, selectedRequest]
  );

  // Batch approve
  const handleBatchApprove = useCallback(async () => {
    await batchExecute('APPROVE');
  }, [batchExecute]);

  // Toggle multi-select mode
  const handleToggleSelectionMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isSelectionMode) {
      clearSelection();
    } else {
      setSelectionMode(true);
    }
  }, [isSelectionMode, clearSelection, setSelectionMode]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {/* ── Screen Header ── */}
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
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Onay Merkezi
          </Text>
          {pendingCount > 0 && (
            <View
              style={[
                styles.pendingBadge,
                { backgroundColor: theme.colors.warningMuted, borderColor: theme.colors.warning },
              ]}
            >
              <Text style={[styles.pendingBadgeText, { color: theme.colors.warning }]}>
                {pendingCount} Bekleyen
              </Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={selectAll}
                style={[styles.headerActionBtn, { backgroundColor: theme.colors.borderSubtle }]}
              >
                <Text style={[styles.headerActionBtnText, { color: theme.colors.primary }]}>
                  Tümünü Seç
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleToggleSelectionMode}
                style={[styles.headerIconBtn, { backgroundColor: theme.colors.borderSubtle }]}
              >
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleToggleSelectionMode}
              style={[styles.headerActionBtn, { backgroundColor: theme.colors.borderSubtle }]}
            >
              <Ionicons name="checkbox-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.headerActionBtnText, { color: theme.colors.primary }]}>
                Çoklu Seç
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Status Tabs ── */}
      <View
        style={[
          styles.statusTabsWrapper,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusTabsScroll}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = filterStatus === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setFilterStatus(tab.key);
                }}
                style={[
                  styles.statusTab,
                  isActive
                    ? [styles.statusTabActive, { backgroundColor: theme.colors.primary }]
                    : { backgroundColor: theme.colors.borderSubtle },
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? '#ffffff' : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.statusTabText,
                    {
                      color: isActive ? '#ffffff' : theme.colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Module Filter Chips ── */}
      <View
        style={[
          styles.moduleChipsWrapper,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moduleChipsScroll}
        >
          {MODULE_CHIPS.map((chip) => {
            const isChipActive = selectedModule === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedModule(chip.key);
                }}
                style={[
                  styles.moduleChip,
                  isChipActive
                    ? [
                        styles.moduleChipActive,
                        {
                          backgroundColor: theme.colors.primaryMuted,
                          borderColor: theme.colors.primary,
                        },
                      ]
                    : [
                        styles.moduleChipInactive,
                        {
                          backgroundColor: theme.colors.surfaceCard,
                          borderColor: theme.colors.borderSubtle,
                        },
                      ],
                ]}
              >
                <Ionicons
                  name={chip.icon}
                  size={13}
                  color={isChipActive ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.moduleChipText,
                    {
                      color: isChipActive ? theme.colors.primary : theme.colors.textSecondary,
                      fontWeight: isChipActive ? '700' : '500',
                    },
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Error Banner if any ── */}
      {error && (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: theme.colors.dangerMuted,
              borderColor: theme.colors.danger,
            },
          ]}
        >
          <Ionicons name="warning-outline" size={16} color={theme.colors.danger} />
          <Text style={[styles.errorBannerText, { color: theme.colors.danger }]}>{error}</Text>
          <TouchableOpacity onPress={() => loadRequests()}>
            <Text style={[styles.retryBtnText, { color: theme.colors.danger }]}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main Approval Requests List ── */}
      {isLoading && !isRefreshing && requests.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
            Onay talepleri yükleniyor...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            isSelectionMode && selectedIds.length > 0 && styles.listWithBatchBar,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ApprovalCard
              request={item}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.includes(item.id)}
              isActing={isActing}
              onPress={handleOpenDetail}
              onApprove={handleApprove}
              onReject={handleRejectPrompt}
              onToggleSelect={toggleSelection}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-circle-outline"
              title="Onay Talebi Yok"
              description={
                filterStatus === 'PENDING'
                  ? 'Şu anda onayınızı bekleyen açık bir talep bulunmuyor.'
                  : 'Seçili filtrelere uygun onay talebi bulunamadı.'
              }
            />
          }
        />
      )}

      {/* ── Detail Modal ── */}
      <ApprovalDetailModal
        visible={detailModalVisible}
        request={selectedRequest}
        isActing={isActing}
        onClose={() => setDetailModalVisible(false)}
        onApprove={handleApprove}
        onReject={handleRejectPrompt}
      />

      {/* ── Rejection Reason Modal ── */}
      <RejectionReasonModal
        visible={rejectionModalVisible}
        request={requestToReject}
        isActing={isActing}
        onClose={() => {
          setRejectionModalVisible(false);
          setRequestToReject(null);
        }}
        onConfirm={handleConfirmReject}
      />

      {/* ── Batch Action Bar ── */}
      {isSelectionMode && (
        <BatchActionBar
          selectedCount={selectedIds.length}
          isActing={isActing}
          onApproveAll={handleBatchApprove}
          onCancel={clearSelection}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTabsWrapper: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  statusTabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  statusTabActive: {},
  statusTabText: {
    fontSize: 12,
  },
  moduleChipsWrapper: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  moduleChipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  moduleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  moduleChipActive: {},
  moduleChipInactive: {},
  moduleChipText: {
    fontSize: 11,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 6,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listWithBatchBar: {
    paddingBottom: 100,
  },
});
