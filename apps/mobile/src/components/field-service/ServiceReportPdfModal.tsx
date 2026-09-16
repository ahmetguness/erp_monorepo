import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldServiceJob,
  ServiceRequestItem,
  getServiceRequestById,
  generateServiceReportHtml,
} from '../../services/field-service.service';
import {
  thermalPrinterService,
  EscPosBuilder,
} from '../../services/thermal-printer.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge } from '../common/Badge';

export interface ServiceReportPdfModalProps {
  visible: boolean;
  job: FieldServiceJob | null;
  customerSignatureSvg?: string[];
  diagnosis?: string;
  actionsTaken?: string;
  onClose: () => void;
}

export const ServiceReportPdfModal: React.FC<ServiceReportPdfModalProps> = ({
  visible,
  job,
  customerSignatureSvg = [],
  diagnosis = 'Cihaz arıza tespit ve parça değişimi yapıldı.',
  actionsTaken = 'Gerekli parça değişimi ve genel bakım tamamlandı.',
  onClose,
}) => {
  const { theme } = useTheme();

  const [items, setItems] = useState<ServiceRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (visible && job) {
      setIsLoading(true);
      getServiceRequestById(job.id)
        .then((detail) => {
          if (detail?.items) {
            setItems(detail.items);
          }
        })
        .catch((err) => {
          console.warn('[ServiceReportPdfModal] Could not fetch request details:', err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [visible, job]);

  if (!job) return null;

  const totalAmount = items.reduce(
    (sum, i) => sum + (Number(i.lineTotal) || Number(i.quantity) * Number(i.unitPrice)),
    0
  );

  const handleShareReport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const itemsText = items
        .map(
          (it, idx) =>
            `${idx + 1}. ${it.product?.name || it.description} x ${it.quantity} Adet = ${formatCurrency(
              it.lineTotal || it.quantity * it.unitPrice
            )}`
        )
        .join('\n');

      const shareContent =
        `*AXON ERP — TEKNİK SERVİS VE BAKIM RAPORU*\n` +
        `Form No: ${job.number}\n` +
        `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n\n` +
        `*Müşteri Bilgileri:*\n` +
        `Cari: ${job.contact?.name || 'Müşteri'}\n` +
        `Telefon: ${job.contact?.phone || '-'}\n` +
        `Adres: ${job.contact?.address || ''} ${job.contact?.city || ''}\n\n` +
        `*Cihaz / Varlık Bilgileri:*\n` +
        `Cihaz: ${job.asset?.name || 'Genel Varlık'}\n` +
        `Marka/Model: ${job.asset?.brand || ''} ${job.asset?.model || '-'}\n` +
        `Seri No: ${job.asset?.serialNo || '-'}\n\n` +
        `*Arıza ve İşlem:* \n` +
        `Şikayet: ${job.subject}\n` +
        `Teşhis: ${diagnosis}\n` +
        `Uygulanan Çözüm: ${actionsTaken}\n\n` +
        `*Kullanılan Yedek Parçalar & İşçilik:*\n` +
        `${itemsText || 'Yedek parça sarfiyatı kaydedilmedi.'}\n\n` +
        `*GENEL TOPLAM:* ${formatCurrency(totalAmount)}\n\n` +
        `*Onay & İmza:*\n` +
        `Müşteri Dijital İmzası Alındı (Elektronik Onaylı)\n` +
        `Bu belge AXON Mobil Saha Servis tarafından oluşturulmuştur.`;

      await Share.share({
        title: `Servis Raporu - ${job.number}`,
        message: shareContent,
      });
    } catch {
      Alert.alert('Hata', 'Rapor paylaşılamadı.');
    }
  };

  const handlePrintThermalSlip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsPrinting(true);
    try {
      const builder = new EscPosBuilder(58, 'ASCII');
      builder.align('center');
      builder.bold(true);
      builder.line('AXON TEKNIK SERVIS');
      builder.bold(false);
      builder.line('SERVIS FORMU');
      builder.doubleDivider();

      builder.align('left');
      builder.row('Form No:', job.number);
      builder.row('Tarih:', new Date().toLocaleDateString('tr-TR'));
      builder.line(`Cari: ${job.contact?.name || 'Musteri'}`);
      if (job.asset?.name) {
        builder.line(`Cihaz: ${job.asset.name} (${job.asset.model || ''})`);
      }
      builder.divider();

      builder.line('PARCA / ISLEM:');
      items.forEach((it) => {
        builder.row(
          it.product?.name || it.description.slice(0, 16),
          formatCurrency(it.lineTotal || it.quantity * it.unitPrice)
        );
      });
      builder.divider();
      builder.bold(true);
      builder.row('TOPLAM:', formatCurrency(totalAmount));
      builder.bold(false);
      builder.doubleDivider();

      builder.align('center');
      builder.line('Musteri Dijital Imzasi');
      builder.line('Sistemde Kayitlidir.');
      builder.feed(2);
      builder.cut();

      const res = await thermalPrinterService.print(
        builder.toBytes(),
        `Servis Fişi - ${job.number}`
      );
      Alert.alert(res.success ? 'Yazdırıldı' : 'Yazıcı Uyarısı', res.message);
    } catch {
      Alert.alert('Hata', 'Termal fiş yazdırılamadı.');
    } finally {
      setIsPrinting(false);
    }
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
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="document-text" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                İmzalı Teknik Servis Raporu
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {job.number} • {new Date().toLocaleDateString('tr-TR')}
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

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Document Sheet Container */}
          <View
            style={[
              styles.documentSheet,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.md,
              },
            ]}
          >
            {/* Sheet Title Bar */}
            <View style={styles.sheetTopRow}>
              <View>
                <Text style={[styles.companyName, { color: theme.colors.primary }]}>
                  AXON ERP TEKNİK SERVİS A.Ş.
                </Text>
                <Text style={[styles.companySub, { color: theme.colors.textMuted }]}>
                  Yetkili Saha Servis ve Bakım Onarım Departmanı
                </Text>
              </View>

              <Badge label={job.status} variant="success" size="sm" />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            {/* Customer & Asset Card */}
            <View style={styles.metaRow}>
              <View
                style={[
                  styles.metaBox,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metaBoxTitle, { color: theme.colors.textMuted }]}>
                  Müşteri Bilgileri
                </Text>
                <Text style={[styles.metaValBold, { color: theme.colors.text }]}>
                  {job.contact?.name || 'Müşteri'}
                </Text>
                <Text style={[styles.metaValSub, { color: theme.colors.textMuted }]}>
                  Tel: {job.contact?.phone || '-'}
                </Text>
                <Text style={[styles.metaValSub, { color: theme.colors.textMuted }]}>
                  {job.contact?.address || ''} {job.contact?.city || ''}
                </Text>
              </View>

              <View
                style={[
                  styles.metaBox,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
              >
                <Text style={[styles.metaBoxTitle, { color: theme.colors.textMuted }]}>
                  Cihaz / Varlık
                </Text>
                <Text style={[styles.metaValBold, { color: theme.colors.text }]}>
                  {job.asset?.name || 'Genel Cihaz'}
                </Text>
                <Text style={[styles.metaValSub, { color: theme.colors.textMuted }]}>
                  Model: {job.asset?.brand || ''} {job.asset?.model || '-'}
                </Text>
                <Text style={[styles.metaValSub, { color: theme.colors.textMuted }]}>
                  Seri No: {job.asset?.serialNo || '-'}
                </Text>
              </View>
            </View>

            {/* Diagnosis & Actions Taken */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
                Arıza Tespiti & Teşhis
              </Text>
              <View
                style={[
                  styles.noteBox,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
              >
                <Text style={[styles.noteText, { color: theme.colors.text }]}>
                  {diagnosis}
                </Text>
              </View>
            </View>

            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
                Uygulanan İşlemler & Çözüm
              </Text>
              <View
                style={[
                  styles.noteBox,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
              >
                <Text style={[styles.noteText, { color: theme.colors.text }]}>
                  {actionsTaken}
                </Text>
              </View>
            </View>

            {/* Spare Parts Table */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
                Kullanılan Yedek Parçalar & İşçilik ({items.length})
              </Text>

              {isLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} style={{ margin: 10 }} />
              ) : items.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Kayıtlı yedek parça kalemi bulunmuyor.
                </Text>
              ) : (
                <View
                  style={[
                    styles.tableBox,
                    { borderColor: theme.colors.borderSubtle },
                  ]}
                >
                  <View style={[styles.tableHeader, { backgroundColor: theme.colors.background }]}>
                    <Text style={[styles.thCol, { flex: 2, color: theme.colors.textMuted }]}>Parça / Açıklama</Text>
                    <Text style={[styles.thCol, { flex: 0.8, textAlign: 'center', color: theme.colors.textMuted }]}>Adet</Text>
                    <Text style={[styles.thCol, { flex: 1.2, textAlign: 'right', color: theme.colors.textMuted }]}>Tutar</Text>
                  </View>

                  {items.map((it, idx) => (
                    <View key={idx} style={styles.tableRow}>
                      <Text style={[styles.tdCol, { flex: 2, color: theme.colors.text }]} numberOfLines={1}>
                        {it.product?.name || it.description}
                      </Text>
                      <Text style={[styles.tdCol, { flex: 0.8, textAlign: 'center', color: theme.colors.text }]}>
                        {it.quantity}
                      </Text>
                      <Text style={[styles.tdCol, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: theme.colors.text }]}>
                        {formatCurrency(it.lineTotal || it.quantity * it.unitPrice)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Total Row */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.text }]}>GENEL TOPLAM:</Text>
                <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
                  {formatCurrency(totalAmount)}
                </Text>
              </View>
            </View>

            {/* Signature Area */}
            <View style={styles.signaturesBlock}>
              <View style={styles.sigBox}>
                <Text style={[styles.sigLabel, { color: theme.colors.textMuted }]}>Teknisyen Onayı</Text>
                <Text style={[styles.sigName, { color: theme.colors.text }]}>Saha Servis Uzmanı</Text>
                <View style={[styles.sigStamp, { borderColor: '#10b981' }]}>
                  <Text style={[styles.sigStampText, { color: '#10b981' }]}>✓ ONAYLANDI</Text>
                </View>
              </View>

              <View style={styles.sigBox}>
                <Text style={[styles.sigLabel, { color: theme.colors.textMuted }]}>Müşteri Dijital İmzası</Text>
                <Text style={[styles.sigName, { color: theme.colors.text }]}>
                  {job.contact?.name || 'Yetkili'}
                </Text>

                {customerSignatureSvg.length > 0 ? (
                  <View style={styles.vectorSigBox}>
                    <Svg viewBox="0 0 320 160" width={130} height={60}>
                      {customerSignatureSvg.map((d, i) => (
                        <Path
                          key={i}
                          d={d}
                          fill="none"
                          stroke={theme.colors.primary}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </Svg>
                  </View>
                ) : (
                  <View style={[styles.vectorSigBox, { borderColor: theme.colors.borderSubtle }]}>
                    <Ionicons name="finger-print" size={20} color={theme.colors.primary} />
                    <Text style={[styles.sigPlaceholder, { color: theme.colors.textMuted }]}>
                      Dijital İmzalı
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.thermalBtn, { backgroundColor: theme.colors.borderSubtle }]}
            disabled={isPrinting}
            onPress={handlePrintThermalSlip}
            activeOpacity={0.7}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <>
                <Ionicons name="print-outline" size={18} color={theme.colors.text} />
                <Text style={[styles.btnTextDark, { color: theme.colors.text }]}>Termal Fiş</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleShareReport}
            activeOpacity={0.8}
          >
            <Ionicons name="share-social" size={18} color="#ffffff" />
            <Text style={styles.btnTextWhite}>Raporu Paylaş / PDF</Text>
          </TouchableOpacity>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
  documentSheet: {
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  companyName: {
    fontSize: 15,
    fontWeight: '800',
  },
  companySub: {
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  metaBoxTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValBold: {
    fontSize: 13,
    fontWeight: '700',
  },
  metaValSub: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionBlock: {
    gap: 6,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 12,
    paddingVertical: 6,
  },
  tableBox: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f030',
  },
  thCol: {
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f015',
  },
  tdCol: {
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  signaturesBlock: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f030',
  },
  sigBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  sigLabel: {
    fontSize: 11,
  },
  sigName: {
    fontSize: 12,
    fontWeight: '700',
  },
  sigStamp: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  sigStampText: {
    fontSize: 11,
    fontWeight: '800',
  },
  vectorSigBox: {
    width: 130,
    height: 50,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  sigPlaceholder: {
    fontSize: 10,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  thermalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnTextDark: {
    fontSize: 14,
    fontWeight: '700',
  },
  shareBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnTextWhite: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
