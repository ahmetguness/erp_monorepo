import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { FieldServiceJob } from '../../services/field-service.service';
import { Badge } from '../common/Badge';

export interface FieldServiceRouteMapModalProps {
  visible: boolean;
  jobs: FieldServiceJob[];
  onClose: () => void;
  onSelectJob: (job: FieldServiceJob) => void;
}

export const FieldServiceRouteMapModal: React.FC<FieldServiceRouteMapModalProps> = ({
  visible,
  jobs,
  onClose,
  onSelectJob,
}) => {
  const { theme } = useTheme();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible && jobs.length > 0) {
      if (!selectedJobId || !jobs.some((j) => j.id === selectedJobId)) {
        setSelectedJobId(jobs[0].id);
      }
    }
  }, [visible, jobs, selectedJobId]);

  const activeJobId = selectedJobId ?? (jobs[0]?.id || null);
  const selectedJob = jobs.find((j) => j.id === activeJobId) || jobs[0];

  const getTargetAddress = (job?: FieldServiceJob | null): string => {
    if (!job) return '';
    const parts = [
      job.contact?.address || job.routeStop?.address || '',
      job.contact?.city || job.routeStop?.city || '',
    ]
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 0) return parts.join(', ');
    return (job.contact?.name || '').trim();
  };

  // Open external navigation apps
  const handleOpenGoogleMaps = (address: string) => {
    const clean = address.trim();
    if (!clean) {
      Alert.alert('Adres Bulunamadı', 'Bu durak için geçerli bir adres bilgisi bulunmuyor.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clean)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else Alert.alert('Hata', 'Google Haritalar uygulaması açılamadı.');
      })
      .catch(() => Alert.alert('Hata', 'Harita başlatılamadı.'));
  };

  const handleOpenAppleMaps = (address: string) => {
    const clean = address.trim();
    if (!clean) {
      Alert.alert('Adres Bulunamadı', 'Bu durak için geçerli bir adres bilgisi bulunmuyor.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const url = `maps://?daddr=${encodeURIComponent(clean)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else handleOpenGoogleMaps(clean);
      })
      .catch(() => handleOpenGoogleMaps(clean));
  };

  const handleCallCustomer = (phone?: string | null) => {
    if (!phone) {
      Alert.alert('Bilgi', 'Müşteriye ait kayıtlı telefon numarası bulunamadı.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {
      Alert.alert('Hata', 'Arama başlatılamadı.');
    });
  };

  // SVG route canvas coordinates calculation
  const canvasWidth = 340;
  const canvasHeight = Math.max(160, jobs.length * 60);
  const stepY = canvasHeight / Math.max(1, jobs.length + 1);

  // Generate node points
  const points = jobs.map((job, idx) => {
    const x = idx % 2 === 0 ? 80 : canvasWidth - 80;
    const y = stepY * (idx + 1);
    return { x, y, job, index: idx + 1 };
  });

  // Build SVG smooth path through points
  let pathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midY = (prev.y + curr.y) / 2;
      pathD += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`;
    }
  }

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
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="navigate-circle" size={22} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Saha Servis Rota & Navigasyon
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                Günlük {jobs.length} Servis Durağı • Sıralı Rotalama
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {jobs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="map-outline" size={48} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              Planlanmış Rota Bulunamadı
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
              Bugün için atanmış veya aktif durumda bir servis durağı bulunmamaktadır.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
          {/* Interactive SVG Route Map Canvas */}
          <View
            style={[
              styles.mapCanvasCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <View style={styles.mapCanvasHeader}>
              <View style={styles.mapLegendRow}>
                <Ionicons name="location" size={16} color={theme.colors.primary} />
                <Text style={[styles.mapLegendTitle, { color: theme.colors.text }]}>
                  Canlı Rota Akışı
                </Text>
              </View>
              <Text style={[styles.mapHintText, { color: theme.colors.textMuted }]}>
                Durağa dokunarak harita odağını değiştirin
              </Text>
            </View>

            <View style={styles.svgWrapper}>
              <Svg width={canvasWidth} height={canvasHeight}>
                <Defs>
                  <LinearGradient id="routeGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity="0.8" />
                    <Stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                  </LinearGradient>
                </Defs>

                {/* Path line */}
                {pathD ? (
                  <Path
                    d={pathD}
                    fill="none"
                    stroke="url(#routeGrad)"
                    strokeWidth="4"
                    strokeDasharray="6,4"
                  />
                ) : null}

                {/* Nodes */}
                {points.map((pt) => {
                  const isSelected = selectedJob?.id === pt.job.id;
                  const isCompleted = pt.job.status === 'COMPLETED';
                  const pinColor = isCompleted
                    ? '#10b981'
                    : isSelected
                    ? theme.colors.primary
                    : '#64748b';

                  return (
                    <React.Fragment key={pt.job.id}>
                      {isSelected && (
                        <Circle
                          cx={pt.x}
                          cy={pt.y}
                          r={24}
                          fill={theme.colors.primary + '30'}
                        />
                      )}
                      <Circle
                        cx={pt.x}
                        cy={pt.y}
                        r={16}
                        fill={pinColor}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedJobId(pt.job.id);
                        }}
                      />
                      <SvgText
                        x={pt.x}
                        y={pt.y + 4}
                        fontSize="12"
                        fontWeight="bold"
                        fill="#ffffff"
                        textAnchor="middle"
                      >
                        {pt.index}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </View>
          </View>

          {/* Active / Focused Stop Card */}
          {selectedJob && (
            <View
              style={[
                styles.focusedCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.primary,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.md,
                },
              ]}
            >
              <View style={styles.focusedCardHeader}>
                <View style={styles.sequenceBadge}>
                  <Text style={styles.sequenceBadgeText}>
                    DURAK #{jobs.findIndex((j) => j.id === selectedJob.id) + 1}
                  </Text>
                </View>

                <Badge
                  label={
                    selectedJob.status === 'COMPLETED'
                      ? 'TAMAMLANDI'
                      : selectedJob.status === 'IN_PROGRESS'
                      ? 'İŞLEMDE'
                      : 'SIRADA'
                  }
                  variant={
                    selectedJob.status === 'COMPLETED'
                      ? 'success'
                      : selectedJob.status === 'IN_PROGRESS'
                      ? 'info'
                      : 'warning'
                  }
                  size="sm"
                />
              </View>

              <Text style={[styles.jobSubject, { color: theme.colors.text }]}>
                {selectedJob.subject}
              </Text>
              <Text style={[styles.customerName, { color: theme.colors.primary }]}>
                {selectedJob.contact?.name || 'Müşteri Adı Belirtilmedi'}
              </Text>

              {/* Address Row */}
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
                <Text style={[styles.detailText, { color: theme.colors.text }]}>
                  {selectedJob.contact?.address || selectedJob.routeStop?.address || 'Adres bilgisi girilmemiş'}{' '}
                  {selectedJob.contact?.city ? `(${selectedJob.contact.city})` : ''}
                </Text>
              </View>

              {/* Phone Row */}
              {Boolean(selectedJob.contact?.phone) && (
                <View style={styles.detailRow}>
                  <Ionicons name="call-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={[styles.detailText, { color: theme.colors.text }]}>
                    {selectedJob.contact?.phone}
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionsBar}>
                {/* Navigation Buttons */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => handleOpenGoogleMaps(getTargetAddress(selectedJob))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate" size={16} color="#ffffff" />
                  <Text style={styles.actionBtnTextWhite}>Google Harita</Text>
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#1e293b' }]}
                    onPress={() => handleOpenAppleMaps(getTargetAddress(selectedJob))}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="map" size={16} color="#ffffff" />
                    <Text style={styles.actionBtnTextWhite}>Apple Harita</Text>
                  </TouchableOpacity>
                )}

                {/* Call Button */}
                {Boolean(selectedJob.contact?.phone) && (
                  <TouchableOpacity
                    style={[styles.iconActionBtn, { backgroundColor: '#10b98120' }]}
                    onPress={() => handleCallCustomer(selectedJob.contact?.phone)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call" size={18} color="#10b981" />
                  </TouchableOpacity>
                )}

                {/* Select Job Button */}
                <TouchableOpacity
                  style={[styles.iconActionBtn, { backgroundColor: theme.colors.borderSubtle }]}
                  onPress={() => {
                    onClose();
                    onSelectJob(selectedJob);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="open-outline" size={18} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sequential Stops List */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 20 }]}>
            Günlük Sıralı Servis Durakları ({jobs.length})
          </Text>

          <View style={styles.stopsList}>
            {jobs.map((job, idx) => {
              const isSel = selectedJob?.id === job.id;
              const isDone = job.status === 'COMPLETED';

              return (
                <TouchableOpacity
                  key={job.id}
                  style={[
                    styles.stopItemCard,
                    {
                      backgroundColor: isSel
                        ? theme.colors.primaryMuted
                        : theme.colors.surfaceCard,
                      borderColor: isSel ? theme.colors.primary : theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedJobId(job.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.stopNumberBadge,
                      {
                        backgroundColor: isDone
                          ? '#10b981'
                          : isSel
                          ? theme.colors.primary
                          : '#64748b',
                      },
                    ]}
                  >
                    <Text style={styles.stopNumberText}>{idx + 1}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.stopItemName,
                        { color: theme.colors.text, fontWeight: isSel ? '700' : '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {job.contact?.name || 'Müşteri'}
                    </Text>
                    <Text
                      style={[styles.stopItemSub, { color: theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {job.subject}
                    </Text>
                  </View>

                  <Ionicons
                    name={isSel ? 'chevron-forward' : 'chevron-forward-outline'}
                    size={16}
                    color={isSel ? theme.colors.primary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
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
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
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
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
  },
  mapCanvasCard: {
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  mapCanvasHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mapLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapLegendTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  mapHintText: {
    fontSize: 11,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedCard: {
    borderWidth: 2,
    padding: 16,
    marginTop: 14,
    gap: 8,
  },
  focusedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sequenceBadge: {
    backgroundColor: '#3b82f620',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sequenceBadgeText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '800',
  },
  jobSubject: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnTextWhite: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  stopsList: {
    gap: 8,
  },
  stopItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
  },
  stopNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumberText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  stopItemName: {
    fontSize: 13,
  },
  stopItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyContainer: {
    margin: 20,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
