import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import {
  FieldServiceJob,
  FieldServiceSummary,
  ServiceStatus,
  getFieldServiceFlow,
} from '../services/field-service.service';
import {
  ServiceJobCard,
  ServiceStatusSelectorModal,
  ServicePartsModal,
  SignatureCaptureModal,
  ServiceReportModal,
  FieldServiceRouteMapModal,
  ServiceReportPdfModal,
} from '../components/field-service';

type StatusFilter = 'ALL' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'OPEN' | 'COMPLETED';

interface Props {
  navigation: any;
}

export default function FieldServiceScreen({ navigation }: Props) {
  const { theme } = useTheme();

  const [jobs, setJobs] = useState<FieldServiceJob[]>([]);
  const [summary, setSummary] = useState<FieldServiceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');

  // Modal states
  const [selectedJobForStatus, setSelectedJobForStatus] = useState<FieldServiceJob | null>(null);
  const [selectedJobForParts, setSelectedJobForParts] = useState<FieldServiceJob | null>(null);
  const [selectedJobForSignature, setSelectedJobForSignature] = useState<FieldServiceJob | null>(null);
  const [selectedJobForReport, setSelectedJobForReport] = useState<FieldServiceJob | null>(null);
  const [routeMapVisible, setRouteMapVisible] = useState(false);
  const [reportPdfJob, setReportPdfJob] = useState<FieldServiceJob | null>(null);
  const [signaturesByJobId, setSignaturesByJobId] = useState<Record<string, string[]>>({});
  const [reportDetailsByJobId, setReportDetailsByJobId] = useState<
    Record<string, { diagnosis: string; actionsTaken: string }>
  >({});

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getFieldServiceFlow();
      setJobs(res.jobs || []);
      setSummary(res.summary || null);
    } catch {
      Alert.alert('Bağlantı Hatası', 'Saha servis çağrıları yüklenemedi.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadJobs();
  };

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Status filter
      if (activeFilter !== 'ALL') {
        if (job.status !== activeFilter) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = job.number.toLowerCase().includes(q);
        const subjMatch = job.subject.toLowerCase().includes(q);
        const custMatch = job.contact?.name.toLowerCase().includes(q);
        const cityMatch = job.contact?.city?.toLowerCase().includes(q);
        const assetMatch = job.asset?.name.toLowerCase().includes(q);
        if (!numMatch && !subjMatch && !custMatch && !cityMatch && !assetMatch) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, activeFilter, searchQuery]);

  const handleStatusUpdated = (jobId: string, newStatus: ServiceStatus) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
  };

  const handleSignatureSaved = (jobId: string, signatureSvgPaths?: string[]) => {
    if (signatureSvgPaths && signatureSvgPaths.length > 0) {
      setSignaturesByJobId((prev) => ({ ...prev, [jobId]: signatureSvgPaths }));
    }
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, customerApproved: true, signatureCount: (j.signatureCount || 0) + 1 } : j
      )
    );
  };

  const handleReportSubmitted = (jobId: string, diagnosis?: string, actionsTaken?: string) => {
    if (diagnosis || actionsTaken) {
      setReportDetailsByJobId((prev) => ({
        ...prev,
        [jobId]: {
          diagnosis: diagnosis || 'Arıza giderildi ve bakım yapıldı.',
          actionsTaken: actionsTaken || 'Gerekli parça ve test işlemleri tamamlandı.',
        },
      }));
    }
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, serviceFormSubmitted: true, status: 'COMPLETED' }
          : j
      )
    );
  };

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
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.colors.borderSubtle }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Saha Teknik Servis
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            {summary ? `${summary.totalJobs} Aktif Çağrı • ${summary.assignedJobCount} Atanan` : 'Teknik Servis Yönetimi'}
          </Text>
        </View>

        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={[styles.routeMapBtn, { backgroundColor: theme.colors.primaryMuted }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setRouteMapVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.routeMapBtnText, { color: theme.colors.primary }]}>Rota</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.refreshBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search Bar & Filter Chips ── */}
      <View style={styles.topFilterWrapper}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              borderRadius: theme.borderRadius.md,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Çağrı no, müşteri, cihaz veya arıza ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[
            { key: 'ALL', label: 'Tüm Çağrılar' },
            { key: 'IN_PROGRESS', label: 'Müdahalede' },
            { key: 'WAITING_PARTS', label: 'Parça Bekleyen' },
            { key: 'OPEN', label: 'Açık / Bekleyen' },
            { key: 'COMPLETED', label: 'Tamamlanan' },
          ].map((f) => {
            const isSelected = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.surfaceCard,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.borderSubtle,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveFilter(f.key as StatusFilter);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? '#ffffff' : theme.colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Calls List ── */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
            Saha servis çağrıları yükleniyor...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ServiceJobCard
              job={item}
              onPress={() => setSelectedJobForStatus(item)}
              onChangeStatus={(j) => setSelectedJobForStatus(j)}
              onAddParts={(j) => setSelectedJobForParts(j)}
              onCaptureSignature={(j) => setSelectedJobForSignature(j)}
              onSubmitReport={(j) => setSelectedJobForReport(j)}
              onViewReportPdf={(j) => setReportPdfJob(j)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="build-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                Servis Çağrısı Bulunamadı
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                Seçili filtreye veya arama kriterine uygun servis talebi bulunmuyor.
              </Text>
            </View>
          }
        />
      )}

      {/* ── Modals ── */}
      <ServiceStatusSelectorModal
        visible={Boolean(selectedJobForStatus)}
        job={selectedJobForStatus}
        onClose={() => setSelectedJobForStatus(null)}
        onStatusUpdated={handleStatusUpdated}
      />

      <ServicePartsModal
        visible={Boolean(selectedJobForParts)}
        job={selectedJobForParts}
        onClose={() => setSelectedJobForParts(null)}
        onItemAdded={loadJobs}
      />

      <SignatureCaptureModal
        visible={Boolean(selectedJobForSignature)}
        job={selectedJobForSignature}
        onClose={() => setSelectedJobForSignature(null)}
        onSignatureSaved={handleSignatureSaved}
      />

      <ServiceReportModal
        visible={Boolean(selectedJobForReport)}
        job={selectedJobForReport}
        onClose={() => setSelectedJobForReport(null)}
        onReportSubmitted={handleReportSubmitted}
      />

      {/* 16.4: Field Service Route Map Modal */}
      <FieldServiceRouteMapModal
        visible={routeMapVisible}
        jobs={jobs}
        onClose={() => setRouteMapVisible(false)}
        onSelectJob={(j) => {
          setSelectedJobForStatus(j);
        }}
      />

      {/* 16.5: Signed Corporate Service Report PDF Modal */}
      <ServiceReportPdfModal
        visible={Boolean(reportPdfJob)}
        job={reportPdfJob}
        customerSignatureSvg={reportPdfJob ? signaturesByJobId[reportPdfJob.id] || [] : []}
        diagnosis={reportPdfJob ? reportDetailsByJobId[reportPdfJob.id]?.diagnosis : undefined}
        actionsTaken={reportPdfJob ? reportDetailsByJobId[reportPdfJob.id]?.actionsTaken : undefined}
        onClose={() => setReportPdfJob(null)}
      />
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  routeMapBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topFilterWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterChipsRow: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
