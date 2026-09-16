import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  InvoiceDetail,
  InvoiceSummary,
  EDocument,
  getInvoiceById,
  getEDocumentById,
} from '../../services/finance.service';
import { Badge } from '../common/Badge';

export interface EDocumentPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  invoiceId?: string | null;
  documentId?: string | null;
  initialInvoice?: InvoiceDetail | InvoiceSummary | null;
  initialEDocument?: EDocument | null;
}

export const EDocumentPreviewModal: React.FC<EDocumentPreviewModalProps> = ({
  visible,
  onClose,
  invoiceId,
  documentId,
  initialInvoice,
  initialEDocument,
}) => {
  const { theme } = useTheme();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [eDocument, setEDocument] = useState<EDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      if (invoiceId) {
        const inv = await getInvoiceById(invoiceId);
        setInvoice(inv);
        if (inv.eDocuments && inv.eDocuments.length > 0) {
          setEDocument(inv.eDocuments[0]);
        }
      } else if (documentId) {
        const doc = await getEDocumentById(documentId);
        setEDocument(doc);
        if (doc.invoice?.id) {
          const inv = await getInvoiceById(doc.invoice.id);
          setInvoice(inv);
        }
      } else if (initialInvoice) {
        // If initial invoice has lines, use it, else fetch details
        if ('lines' in initialInvoice && initialInvoice.lines) {
          setInvoice(initialInvoice as InvoiceDetail);
        } else {
          const inv = await getInvoiceById(initialInvoice.id);
          setInvoice(inv);
        }
        if (initialEDocument) {
          setEDocument(initialEDocument);
        }
      } else if (initialEDocument) {
        setEDocument(initialEDocument);
        if (initialEDocument.invoice?.id) {
          const inv = await getInvoiceById(initialEDocument.invoice.id);
          setInvoice(inv);
        }
      }
    } catch (err) {
      console.warn('[EDocumentPreviewModal] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId, documentId, initialInvoice, initialEDocument]);

  useEffect(() => {
    if (visible) {
      loadData();
    } else {
      setInvoice(null);
      setEDocument(null);
    }
  }, [visible, loadData]);

  const formatCurrency = (val?: number | null, curr = 'TRY'): string => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  const formatDate = (isoStr?: string | null): string => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const docType = eDocument?.type || (invoice?.type === 'SALES' ? 'E_INVOICE' : 'E_ARCHIVE');
  const docTypeLabel =
    docType === 'E_INVOICE'
      ? 'E-FATURA'
      : docType === 'E_WAYBILL'
      ? 'E-İRSALİYE'
      : 'E-ARŞİV FATURA';

  const docNumber = invoice?.number || eDocument?.invoice?.number || eDocument?.deliveryNote?.number || 'GİB2026-BELGE';
  const docUUID = eDocument?.uuid || '8f6b21c0-798a-4d22-b91e-c1e19488e99b';
  const contact = invoice?.contact;

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const shareText =
      `📄 ${docTypeLabel} - ${docNumber}\n` +
      `ETTN (UUID): ${docUUID}\n` +
      `Müşteri: ${contact?.name || '-'}\n` +
      `Tarih: ${formatDate(invoice?.date)}\n` +
      `Genel Toplam: ${formatCurrency(invoice?.totalGross, invoice?.currencyCode)}\n\n` +
      `Axon ERP Enterprise E-Belge Portalı`;

    try {
      await Share.share({
        title: `${docNumber} - ${docTypeLabel}`,
        message: shareText,
      });
    } catch (err) {
      console.warn('[EDocumentPreviewModal] Share error:', err);
    }
  };

  const handleWhatsAppShare = () => {
    if (!contact?.phone) {
      Alert.alert('Bilgi', 'Müşterinin telefon numarası kayıtlı değil.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Bilgi', 'Müşterinin telefon numarası geçerli formatta değil.');
      return;
    }

    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;

    const text =
      `Sayın *${contact.name}*,\n\n` +
      `Firmanıza ait *${docNumber}* numaralı *${docTypeLabel}* belgesi düzenlenmiştir.\n\n` +
      `📌 *ETTN:* ${docUUID}\n` +
      `📅 *Tarih:* ${formatDate(invoice?.date)}\n` +
      `💰 *Tutar:* ${formatCurrency(invoice?.totalGross, invoice?.currencyCode)}\n\n` +
      `Belgenizin detaylarını ERP sistemimizden inceleyebilirsiniz.\n\n` +
      `_Axon ERP E-Belge Portalı_`;

    Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Top Header */}
        <View style={[styles.topBar, { borderBottomColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity style={styles.iconCircle} onPress={onClose}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: theme.colors.text }]}>E-Belge Önizleme</Text>
          <TouchableOpacity style={styles.iconCircle} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loaderText, { color: theme.colors.textMuted }]}>E-Belge oluşturuluyor...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* GİB Official Document Simulation Frame */}
            <View style={[styles.docPaper, { backgroundColor: '#ffffff', borderColor: '#cbd5e1' }]}>
              {/* Document Banner */}
              <View style={styles.gibHeaderRow}>
                <View style={styles.gibBadge}>
                  <Text style={styles.gibBadgeTitle}>T.C. HAZİNE VE MALİYE BAKANLIĞI</Text>
                  <Text style={styles.gibBadgeSub}>Gelir İdaresi Başkanlığı</Text>
                </View>

                <View style={styles.docTypeBadge}>
                  <Text style={styles.docTypeBadgeText}>{docTypeLabel}</Text>
                  <Badge
                    label={eDocument?.status === 'ACCEPTED' ? 'GİB ONAYLI' : 'RESMİ BELGE'}
                    variant={eDocument?.status === 'ACCEPTED' ? 'success' : 'info'}
                  />
                </View>
              </View>

              {/* Document Identifiers Bar */}
              <View style={styles.idBox}>
                <View style={styles.idRow}>
                  <Text style={styles.idLabel}>Belge No:</Text>
                  <Text style={styles.idValue}>{docNumber}</Text>
                </View>
                <View style={styles.idRow}>
                  <Text style={styles.idLabel}>ETTN (UUID):</Text>
                  <Text style={[styles.idValue, { fontSize: 10 }]}>{docUUID}</Text>
                </View>
                <View style={styles.idRow}>
                  <Text style={styles.idLabel}>Tarih:</Text>
                  <Text style={styles.idValue}>{formatDate(invoice?.date)}</Text>
                </View>
                {invoice?.dueDate && (
                  <View style={styles.idRow}>
                    <Text style={styles.idLabel}>Vade Tarihi:</Text>
                    <Text style={[styles.idValue, { color: '#dc2626' }]}>{formatDate(invoice.dueDate)}</Text>
                  </View>
                )}
              </View>

              {/* Sender & Receiver Info */}
              <View style={styles.partiesGrid}>
                {/* Sender */}
                <View style={[styles.partyCol, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }]}>
                  <Text style={styles.partyRole}>DÜZENLEYEN (SATICI)</Text>
                  <Text style={styles.partyName}>AXON ENTERPRISE ERP A.Ş.</Text>
                  <Text style={styles.partyText}>VKN: 1234567890</Text>
                  <Text style={styles.partyText}>Vergi Dairesi: Beşiktaş V.D.</Text>
                  <Text style={styles.partyText}>Levent Mah. Cömert Sk. No: 1, İstanbul</Text>
                </View>

                {/* Receiver */}
                <View style={styles.partyCol}>
                  <Text style={styles.partyRole}>ALICI (MÜŞTERİ)</Text>
                  <Text style={styles.partyName}>{contact?.name || 'Müşteri Unvanı'}</Text>
                  <Text style={styles.partyText}>VKN/TCKN: {contact?.taxNumber || '-'}</Text>
                  <Text style={styles.partyText}>Telefon: {contact?.phone || '-'}</Text>
                  <Text style={styles.partyText} numberOfLines={2}>
                    {contact?.address || 'Adres bilgisi girilmemiş.'}
                  </Text>
                </View>
              </View>

              {/* Items Table */}
              <View style={styles.itemsTable}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.colHeader, { flex: 2 }]}>Kalem / Hizmet</Text>
                  <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>Miktar</Text>
                  <Text style={[styles.colHeader, { width: 64, textAlign: 'right' }]}>B. Fiyat</Text>
                  <Text style={[styles.colHeader, { width: 70, textAlign: 'right' }]}>Tutar</Text>
                </View>

                {invoice?.lines && invoice.lines.length > 0 ? (
                  invoice.lines.map((line, index) => (
                    <View key={line.id || index} style={styles.tableRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.itemTitle}>{line.description || line.product?.name || 'Ürün'}</Text>
                        {line.product?.code && <Text style={styles.itemCode}>Kod: {line.product.code}</Text>}
                      </View>
                      <Text style={[styles.itemQty, { width: 44, textAlign: 'center' }]}>{line.quantity}</Text>
                      <Text style={[styles.itemPrice, { width: 64, textAlign: 'right' }]}>
                        {line.unitPrice.toFixed(2)}
                      </Text>
                      <Text style={[styles.itemTotal, { width: 70, textAlign: 'right' }]}>
                        {line.lineTotal.toFixed(2)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyLines}>
                    <Text style={styles.emptyLinesText}>Genel Satış / Hizmet Faturası</Text>
                  </View>
                )}
              </View>

              {/* Financial Totals Calculation Box */}
              <View style={styles.totalsBox}>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Mal / Hizmet Toplam Tutarı (Matrah):</Text>
                  <Text style={styles.totalVal}>{formatCurrency(invoice?.totalNet, invoice?.currencyCode)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Hesaplanan KDV (%20):</Text>
                  <Text style={styles.totalVal}>{formatCurrency(invoice?.totalTax, invoice?.currencyCode)}</Text>
                </View>
                {invoice?.totalWithholding ? (
                  <View style={styles.totalLine}>
                    <Text style={styles.totalLabel}>Tevkifat Tutarı:</Text>
                    <Text style={[styles.totalVal, { color: '#dc2626' }]}>
                      -{formatCurrency(invoice.totalWithholding, invoice?.currencyCode)}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.totalLine, styles.grandTotalLine]}>
                  <Text style={styles.grandTotalLabel}>Ödenecek Tutar (Genel Yekûn):</Text>
                  <Text style={styles.grandTotalVal}>{formatCurrency(invoice?.totalGross, invoice?.currencyCode)}</Text>
                </View>
              </View>

              {/* Barcode & Security Stamp Simulation */}
              <View style={styles.securityRow}>
                <View style={styles.barcodeBox}>
                  <Ionicons name="barcode-outline" size={36} color="#334155" />
                  <Text style={styles.barcodeText}>{docUUID.substring(0, 18)}</Text>
                </View>
                <View style={styles.stampBox}>
                  <Ionicons name="checkmark-circle" size={32} color="#059669" />
                  <Text style={styles.stampText}>ELEKTRONİK İMZALIDIR</Text>
                </View>
              </View>
            </View>

            {/* Sharing Action Buttons */}
            <View style={styles.bottomActions}>
              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: '#10b981' }]} onPress={handleWhatsAppShare}>
                <Ionicons name="logo-whatsapp" size={18} color="#ffffff" />
                <Text style={styles.shareBtnText}>Müşteriye WhatsApp'tan Gönder</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.shareBtn, { backgroundColor: '#2563eb' }]} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={18} color="#ffffff" />
                <Text style={styles.shareBtnText}>PDF / Belge Olarak Paylaş</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  docPaper: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  gibHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#dc2626',
    paddingBottom: 10,
    marginBottom: 10,
  },
  gibBadge: {
    flex: 1,
  },
  gibBadgeTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.3,
  },
  gibBadgeSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  docTypeBadge: {
    alignItems: 'flex-end',
    gap: 4,
  },
  docTypeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
  },
  idBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    gap: 4,
    marginBottom: 12,
  },
  idRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  idLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  idValue: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '700',
  },
  partiesGrid: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  partyCol: {
    flex: 1,
    paddingHorizontal: 6,
    gap: 2,
  },
  partyRole: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 2,
  },
  partyName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  partyText: {
    fontSize: 10,
    color: '#475569',
  },
  itemsTable: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 6,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  itemCode: {
    fontSize: 9,
    color: '#94a3b8',
  },
  itemQty: {
    fontSize: 11,
    color: '#334155',
  },
  itemPrice: {
    fontSize: 11,
    color: '#334155',
  },
  itemTotal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyLines: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyLinesText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  totalsBox: {
    alignSelf: 'flex-end',
    width: '80%',
    gap: 4,
    marginBottom: 12,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  totalVal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  grandTotalLine: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  grandTotalVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563eb',
  },
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barcodeText: {
    fontSize: 9,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stampBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stampText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  bottomActions: {
    marginTop: 16,
    gap: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    gap: 8,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
