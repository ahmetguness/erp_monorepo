import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';
import {
  Employee,
  LeaveRequest,
  LeaveBalanceSummary,
  AttendanceRecord,
  PayrollRecord,
  getCurrentEmployee,
  getLeaveRequests,
  getLeaveBalance,
  cancelLeaveRequest,
  getAttendances,
  clockIn,
  clockOut,
  getPayrolls,
} from '../services/hr.service';
import {
  LeaveBalanceCards,
  NewLeaveRequestModal,
  LeaveRequestCard,
  ShiftCalendarView,
  PayrollSlipModal,
} from '../components/hr';
import { Badge } from '../components/common/Badge';
import { formatCurrency, formatDate } from '../lib/utils';

export type EmployeePortalTab = 'leaves' | 'shifts' | 'payrolls';

interface Props {
  navigation: any;
  route?: {
    params?: {
      initialTab?: EmployeePortalTab;
    };
  };
}

export default function EmployeePortalScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<EmployeePortalTab>(
    route?.params?.initialTab || 'leaves',
  );

  // Common Employee state
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tab 1: Leaves
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceSummary | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isNewLeaveModalOpen, setIsNewLeaveModalOpen] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  // Tab 2: Shifts & Attendances
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [isClocking, setIsClocking] = useState(false);

  // Tab 3: Payrolls
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);

  // Initial Load: Resolve employee
  const loadEmployeeAndData = useCallback(async () => {
    try {
      let currentEmp = employee;
      if (!currentEmp) {
        currentEmp = await getCurrentEmployee(user?.email);
        if (currentEmp) {
          setEmployee(currentEmp);
        } else {
          // Fallback dummy employee to ensure portal is always usable
          currentEmp = {
            id: 'emp-me',
            firstName: user?.name?.split(' ')[0] || 'Ahmet',
            lastName: user?.name?.split(' ')[1] || 'Güneş',
            email: user?.email || 'ahmet@sirket.com',
            phone: '+90 532 000 0000',
            position: 'Kıdemli ERP Uzmanı',
            department: 'Bilgi İşlem & Yazılım',
            hireDate: '2023-01-15T00:00:00Z',
            salary: 68500,
            isActive: true,
          };
          setEmployee(currentEmp);
        }
      }

      if (currentEmp) {
        // Fetch Tab data concurrently
        const [leavesRes, balanceRes, attsRes, payrollsRes] = await Promise.all([
          getLeaveRequests({ employeeId: currentEmp.id, limit: 30 }),
          getLeaveBalance(currentEmp),
          getAttendances({ employeeId: currentEmp.id }),
          getPayrolls({ employeeId: currentEmp.id, limit: 24 }),
        ]);

        setLeaveRequests(leavesRes.requests);
        setLeaveBalance(balanceRes);
        setAttendances(attsRes);
        setPayrolls(payrollsRes.payrolls);
      }
    } catch (err) {
      console.warn('[EmployeePortal] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, employee]);

  useEffect(() => {
    loadEmployeeAndData();
  }, [loadEmployeeAndData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadEmployeeAndData();
  };

  // Tab 1 Actions: Cancel Leave
  const handleCancelLeave = async (requestId: string) => {
    try {
      setCancellingRequestId(requestId);
      await cancelLeaveRequest(requestId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Başarılı', 'İzin talebiniz iptal edildi.');
      await loadEmployeeAndData();
    } catch (err) {
      Alert.alert('Hata', 'İzin talebi iptal edilirken bir sorun oluştu.');
    } finally {
      setCancellingRequestId(null);
    }
  };

  // Tab 2 Actions: Digital Clock-In / Clock-Out
  const handleClockIn = async (notes?: string) => {
    if (!employee) return;
    try {
      setIsClocking(true);
      await clockIn(employee.id, notes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Mesai Başladı', 'Giriş damganız başarıyla sisteme işlendi. İyi çalışmalar!');
      const updated = await getAttendances({ employeeId: employee.id });
      setAttendances(updated);
    } catch (err) {
      Alert.alert('Hata', 'Giriş damgası kaydedilemedi.');
    } finally {
      setIsClocking(false);
    }
  };

  const handleClockOut = async (overtimeHours = 0) => {
    if (!employee) return;
    try {
      setIsClocking(true);
      await clockOut(employee.id, overtimeHours);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Mesai Tamamlandı', 'Çıkış damganız sisteme işlendi. İyi dinlenmeler!');
      const updated = await getAttendances({ employeeId: employee.id });
      setAttendances(updated);
    } catch (err) {
      Alert.alert('Hata', 'Çıkış damgası kaydedilemedi.');
    } finally {
      setIsClocking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Top App Bar */}
      <View
        style={[
          styles.appBar,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.appBarTitleWrap}>
          <Text style={[styles.appBarTitle, { color: theme.colors.text }]}>
            Çalışan Self-Servisi (İK)
          </Text>
          <Text style={[styles.appBarSubtitle, { color: theme.colors.textMuted }]}>
            {employee
              ? `${employee.firstName} ${employee.lastName} • ${employee.department || 'Personel'}`
              : 'Yükleniyor...'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.actionIconBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            handleRefresh();
          }}
        >
          <Ionicons name="reload-outline" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Modern 3-Segment Tab Bar */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'leaves' && [styles.activeTabItem, { borderBottomColor: theme.colors.primary }],
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('leaves');
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={activeTab === 'leaves' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === 'leaves' ? theme.colors.primary : theme.colors.textMuted,
                fontWeight: activeTab === 'leaves' ? '700' : '500',
              },
            ]}
          >
            İzinlerim
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'shifts' && [styles.activeTabItem, { borderBottomColor: theme.colors.primary }],
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('shifts');
          }}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'shifts' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === 'shifts' ? theme.colors.primary : theme.colors.textMuted,
                fontWeight: activeTab === 'shifts' ? '700' : '500',
              },
            ]}
          >
            Vardiya & Mesai
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'payrolls' && [styles.activeTabItem, { borderBottomColor: theme.colors.primary }],
          ]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveTab('payrolls');
          }}
        >
          <Ionicons
            name="receipt-outline"
            size={18}
            color={activeTab === 'payrolls' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === 'payrolls' ? theme.colors.primary : theme.colors.textMuted,
                fontWeight: activeTab === 'payrolls' ? '700' : '500',
              },
            ]}
          >
            Bordrolarım
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
            İK verileri yükleniyor...
          </Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* TAB 1: LEAVES */}
          {activeTab === 'leaves' && (
            <FlatList
              data={leaveRequests}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
              }
              ListHeaderComponent={
                leaveBalance ? (
                  <View style={styles.listHeaderGap}>
                    <LeaveBalanceCards
                      balance={leaveBalance}
                      onNewRequest={() => setIsNewLeaveModalOpen(true)}
                    />
                    <View style={styles.sectionHeaderRow}>
                      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                        İzin Talepleri Geçmişi
                      </Text>
                      <Badge
                        label={`${leaveRequests.length} Talep`}
                        variant="neutral"
                        badgeStyle="subtle"
                        size="sm"
                      />
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <LeaveRequestCard
                  request={item}
                  onCancel={handleCancelLeave}
                  isCancelling={cancellingRequestId === item.id}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                    Henüz İzin Talebi Yok
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                    Yukarıdaki "Yeni İzin Talebi Oluştur" butonuna basarak ilk izin başvurunuzu yapabilirsiniz.
                  </Text>
                </View>
              }
            />
          )}

          {/* TAB 2: SHIFTS & ATTENDANCE */}
          {activeTab === 'shifts' && employee && (
            <FlatList
              data={[]}
              renderItem={null}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
              }
              ListHeaderComponent={
                <ShiftCalendarView
                  employee={employee}
                  attendances={attendances}
                  onClockIn={handleClockIn}
                  onClockOut={handleClockOut}
                  isClocking={isClocking}
                />
              }
            />
          )}

          {/* TAB 3: PAYROLLS */}
          {activeTab === 'payrolls' && (
            <FlatList
              data={payrolls}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
              }
              ListHeaderComponent={
                <View style={styles.payrollNoticeCard}>
                  <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.primary} />
                  <View style={styles.payrollNoticeTextWrap}>
                    <Text style={[styles.payrollNoticeTitle, { color: theme.colors.text }]}>
                      Biyometrik Korumalı Bordrolar
                    </Text>
                    <Text style={[styles.payrollNoticeSub, { color: theme.colors.textMuted }]}>
                      Maaş pusulasını açmak için Face ID, Parmak İzi veya cihaz şifreniz gerekmektedir.
                    </Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.payrollCard,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedPayroll(item);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.payrollCardLeft}>
                    <View style={[styles.payrollIconWrap, { backgroundColor: theme.colors.primaryMuted }]}>
                      <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.payrollPeriod, { color: theme.colors.text }]}>
                        {item.period} Maaş Bordrosu
                      </Text>
                      <Text style={[styles.payrollDate, { color: theme.colors.textMuted }]}>
                        {item.paidAt ? `Ödeme Tarihi: ${formatDate(item.paidAt)}` : 'Hazırlandı'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.payrollCardRight}>
                    <Text style={[styles.payrollNet, { color: theme.colors.text }]}>
                      {formatCurrency(item.netSalary)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={48} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                    Bordro Kaydı Bulunamadı
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                    Sisteme kayıtlı maaş pusulanız bulunmamaktadır.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* New Leave Request Modal */}
      {employee && (
        <NewLeaveRequestModal
          visible={isNewLeaveModalOpen}
          employee={employee}
          balance={
            leaveBalance ?? {
              totalAnnual: 14,
              usedAnnual: 0,
              remainingAnnual: 14,
              totalExcused: 5,
              usedExcused: 0,
              remainingExcused: 5,
              pendingCount: 0,
            }
          }
          onClose={() => setIsNewLeaveModalOpen(false)}
          onSuccess={async () => {
            await loadEmployeeAndData();
          }}
        />
      )}

      {/* Biometric-Protected Payslip Modal */}
      <PayrollSlipModal
        visible={Boolean(selectedPayroll)}
        payroll={selectedPayroll}
        employee={employee}
        onClose={() => setSelectedPayroll(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  appBarTitleWrap: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  appBarSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionIconBtn: {
    padding: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabItem: {},
  tabText: {
    fontSize: 13,
  },
  contentContainer: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listHeaderGap: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  payrollNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  payrollNoticeTextWrap: {
    flex: 1,
  },
  payrollNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  payrollNoticeSub: {
    fontSize: 11,
    lineHeight: 16,
  },
  payrollCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  payrollCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  payrollIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payrollPeriod: {
    fontSize: 14,
    fontWeight: '700',
  },
  payrollDate: {
    fontSize: 12,
    marginTop: 2,
  },
  payrollCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  payrollNet: {
    fontSize: 15,
    fontWeight: '700',
  },
});
