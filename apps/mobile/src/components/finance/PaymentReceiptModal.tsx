import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  PaymentMethod,
  CashAccount,
  BankAccount,
  InvoiceSummary,
  OverdueInvoice,
  getCashAccounts,
  getBankAccounts,
  getInvoices,
  createPaymentReceipt,
} from '../../services/finance.service';
import { getContacts, Contact, ContactListItem } from '../../services/contact.service';
import { CheckPhotoCaptureModal } from './CheckPhotoCaptureModal';

export interface PaymentReceiptModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialInvoice?: OverdueInvoice | InvoiceSummary | null;
  initialContactId?: string;
  initialAmount?: number;
}

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'CASH', label: 'Nakit', icon: 'cash-outline' },
  { id: 'CREDIT_CARD', label: 'Kredi Kartı', icon: 'card-outline' },
  { id: 'BANK_TRANSFER', label: 'Havale / EFT', icon: 'business-outline' },
  { id: 'CHECK', label: 'Çek', icon: 'document-text-outline' },
];

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  visible,
  onClose,
  onSuccess,
  initialInvoice,
  initialContactId,
  initialAmount,
}) => {
  const { theme } = useTheme();

  // Form State
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [selectedContact, setSelectedContact] = useState<Contact | ContactListItem | null>(null);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);

  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string>('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');

  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Check specific fields
  const [checkBankName, setCheckBankName] = useState<string>('');
  const [checkNumber, setCheckNumber] = useState<string>('');
  const [checkDueDate, setCheckDueDate] = useState<string>('');
  const [checkFrontPhoto, setCheckFrontPhoto] = useState<string | undefined>();
  const [checkBackPhoto, setCheckBackPhoto] = useState<string | undefined>();
  const [isCheckCameraOpen, setIsCheckCameraOpen] = useState<boolean>(false);

  // Invoice allocations
  const [openInvoices, setOpenInvoices] = useState<InvoiceSummary[]>([]);
  const [allocatedInvoiceIds, setAllocatedInvoiceIds] = useState<Set<string>>(new Set());

  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load cash/bank accounts & contacts
  const loadDependencies = useCallback(async () => {
    try {
      setIsLoadingDependencies(true);
      const [cashRes, bankRes, contactRes] = await Promise.all([
        getCashAccounts().catch(() => []),
        getBankAccounts().catch(() => []),
        getContacts({ limit: 100 }).catch(() => ({ items: [], total: 0 })),
      ]);

      setCashAccounts(cashRes);
      if (cashRes.length > 0 && !selectedCashAccountId) {
        setSelectedCashAccountId(cashRes[0].id);
      }

      setBankAccounts(bankRes);
      if (bankRes.length > 0 && !selectedBankAccountId) {
        setSelectedBankAccountId(bankRes[0].id);
      }

      setContacts(contactRes.items);
    } catch (err) {
      console.warn('[PaymentReceiptModal] loadDependencies error:', err);
    } finally {
      setIsLoadingDependencies(false);
    }
  }, [selectedCashAccountId, selectedBankAccountId]);

  // Load customer open invoices
  const loadOpenInvoices = useCallback(async (contactId: string) => {
    try {
      const res = await getInvoices({
        contactId,
        type: 'SALES',
        status: 'OVERDUE',
      });
      const partialRes = await getInvoices({
        contactId,
        type: 'SALES',
        status: 'PARTIALLY_PAID',
      });
      const combined = [...res.invoices, ...partialRes.invoices];
      const dedup = Array.from(new Map(combined.map((i) => [i.id, i])).values());
      setOpenInvoices(dedup);
    } catch {
      setOpenInvoices([]);
    }
  }, []);

  // Initialize on modal open
  useEffect(() => {
    if (!visible) return;

    loadDependencies();

    if (initialAmount) {
      setAmount(initialAmount.toString());
    } else if (initialInvoice) {
      const remaining = 'remainingAmount' in initialInvoice ? initialInvoice.remainingAmount : initialInvoice.totalGross;
      setAmount(remaining.toString());
    } else {
      setAmount('');
    }

    if (initialInvoice) {
      setSelectedContact({
        id: initialInvoice.contact.id,
        name: initialInvoice.contact.name,
        type: 'CUSTOMER',
        taxNumber: initialInvoice.contact.taxNumber || null,
        phone: initialInvoice.contact.phone || null,
        email: initialInvoice.contact.email || null,
        address: initialInvoice.contact.address || null,
        city: null,
      } as Contact);
      setAllocatedInvoiceIds(new Set([initialInvoice.id]));
      loadOpenInvoices(initialInvoice.contact.id);
    } else if (initialContactId) {
      // Find in contacts
      const found = contacts.find((c) => c.id === initialContactId);
      if (found) {
        setSelectedContact(found);
        loadOpenInvoices(found.id);
      }
    } else {
      setSelectedContact(null);
      setAllocatedInvoiceIds(new Set());
      setOpenInvoices([]);
    }

    // Reset check details
    setCheckBankName('');
    setCheckNumber('');
    setCheckDueDate('');
    setCheckFrontPhoto(undefined);
    setCheckBackPhoto(undefined);
    setReference(`TKM-${Date.now().toString().slice(-6)}`);
    setNotes('');
  }, [visible, initialInvoice, initialContactId, initialAmount, loadDependencies, loadOpenInvoices]);

  const handleSelectContact = (c: Contact) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedContact(c);
    setIsContactPickerOpen(false);
    setAllocatedInvoiceIds(new Set());
    loadOpenInvoices(c.id);
  };

  const toggleInvoiceAllocation = (inv: InvoiceSummary) => {
    Haptics.selectionAsync().catch(() => {});
    setAllocatedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(inv.id)) {
        next.delete(inv.id);
      } else {
        next.add(inv.id);
      }
      return next;
    });
  };

  const handleSendWhatsAppReceipt = (
    contactName: string,
    contactPhone?: string | null,
    receiptRef?: string,
    collectedAmount?: number,
  ) => {
    if (!contactPhone) return;

    const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Bilgi', 'Müşterinin telefon numarası geçerli formatta değil.');
      return;
    }

    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;

    const formattedAmount = new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
    }).format(collectedAmount || 0);

    const methodText = PAYMENT_METHODS.find((m) => m.id === method)?.label || 'Tahsilat';
    const dateStr = new Date().toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const msg =
      `*AXON ERP TAHSİLAT MAKBUZU*\n\n` +
      `Sayın *${contactName}*,\n\n` +
      `*${formattedAmount}* tutarındaki *${methodText}* tahsilatınız hesabımıza işlenmiştir.\n\n` +
      `📌 *Makbuz No:* ${receiptRef || '-'}\n` +
      `📅 *Tarih:* ${dateStr}\n\n` +
      `İş birliğiniz için teşekkür eder, iyi çalışmalar dileriz.\n\n` +
      `_Axon ERP Finans Yönetimi_`;

    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Uyarı', 'Lütfen geçerli bir tahsilat tutarı giriniz.');
      return;
    }

    if (!selectedContact) {
      Alert.alert('Uyarı', 'Lütfen tahsilat yapılan cariyi seçiniz.');
      return;
    }

    if (method === 'CASH' && !selectedCashAccountId) {
      Alert.alert('Uyarı', 'Lütfen tahsilatın girileceği kasa hesabını seçiniz.');
      return;
    }

    if ((method === 'CREDIT_CARD' || method === 'BANK_TRANSFER') && !selectedBankAccountId) {
      Alert.alert('Uyarı', 'Lütfen banka hesabını seçiniz.');
      return;
    }

    try {
      setIsSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // Build allocations safely without exceeding payment amount
      let remainingToAllocate = numAmount;
      const allocations: Array<{ invoiceId: string; amount: number }> = [];

      for (const invId of allocatedInvoiceIds) {
        if (remainingToAllocate <= 0) break;
        const inv = openInvoices.find((i) => i.id === invId);
        const invDue = inv ? inv.totalGross : remainingToAllocate;
        const allocAmount = Math.min(remainingToAllocate, invDue);
        if (allocAmount > 0) {
          allocations.push({
            invoiceId: invId,
            amount: Number(allocAmount.toFixed(2)),
          });
          remainingToAllocate -= allocAmount;
        }
      }

      // Notes composition
      let finalNotes = notes.trim();
      if (method === 'CHECK') {
        const checkDetails = `Çek Bilgisi: Banka: ${checkBankName || '-'}, Çek No: ${checkNumber || '-'}, Vade: ${checkDueDate || '-'}`;
        finalNotes = finalNotes ? `${finalNotes} | ${checkDetails}` : checkDetails;
      }

      await createPaymentReceipt({
        contactId: selectedContact.id,
        cashAccountId: method === 'CASH' ? selectedCashAccountId : undefined,
        bankAccountId: method === 'CREDIT_CARD' || method === 'BANK_TRANSFER' ? selectedBankAccountId : undefined,
        date: new Date().toISOString(),
        amount: numAmount,
        method,
        direction: 'RECEIVE',
        reference: reference.trim() || undefined,
        notes: finalNotes || undefined,
        allocations: allocations.length > 0 ? allocations : undefined,
        checkFrontPhotoUri: checkFrontPhoto,
        checkBackPhotoUri: checkBackPhoto,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Prompt to send WhatsApp receipt
      if (selectedContact.phone) {
        Alert.alert(
          'Tahsilat Kaydedildi',
          `${selectedContact.name} için ${numAmount} TL tutarında tahsilat makbuzu başarıyla kesildi. Müşteriye WhatsApp makbuzu iletilsin mi?`,
          [
            {
              text: 'Kapat',
              style: 'cancel',
              onPress: () => {
                onSuccess();
                onClose();
              },
            },
            {
              text: 'WhatsApp Gönder',
              onPress: () => {
                handleSendWhatsAppReceipt(selectedContact.name, selectedContact.phone, reference, numAmount);
                onSuccess();
                onClose();
              },
            },
          ],
        );
      } else {
        Alert.alert('Başarılı', 'Tahsilat makbuzu sisteme işlendi.', [
          {
            text: 'Tamam',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ]);
      }
    } catch (err: unknown) {
      console.warn('[PaymentReceiptModal] Submit error:', err);
      const errMsg = err instanceof Error ? err.message : 'Tahsilat kaydedilirken hata oluştu.';
      Alert.alert('Hata', errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalRoot, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Tahsilat Makbuzu Kes</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Payment Method Selector */}
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>TAHSİLAT YÖNTEMİ</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => {
              const isSelected = method === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.methodCard,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setMethod(m.id);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={m.icon}
                    size={20}
                    color={isSelected ? '#ffffff' : theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.methodText,
                      { color: isSelected ? '#ffffff' : theme.colors.text },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>TAHSİLAT TUTARI (₺) *</Text>
            <View style={[styles.amountInputWrap, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.currencySymbol, { color: theme.colors.primary }]}>₺</Text>
              <TextInput
                style={[styles.amountInput, { color: theme.colors.text }]}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={theme.colors.textMuted}
                value={amount}
                onChangeText={setAmount}
              />
            </View>
          </View>

          {/* Customer Selection */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>CARİ / MÜŞTERİ *</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}
              onPress={() => setIsContactPickerOpen((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerValue, { color: selectedContact ? theme.colors.text : theme.colors.textMuted }]}>
                  {selectedContact ? selectedContact.name : 'Müşteri Seçiniz...'}
                </Text>
                {selectedContact?.taxNumber && (
                  <Text style={[styles.pickerSub, { color: theme.colors.textMuted }]}>
                    VKN: {selectedContact.taxNumber}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {/* Inline Contacts Dropdown List */}
            {isContactPickerOpen && (
              <View style={[styles.contactDropdown, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                  {contacts.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.dropdownItem, { borderBottomColor: theme.colors.borderSubtle }]}
                      onPress={() => handleSelectContact(c)}
                    >
                      <Text style={[styles.dropdownText, { color: theme.colors.text }]}>{c.name}</Text>
                      {c.phone && <Text style={{ fontSize: 11, color: '#64748b' }}>{c.phone}</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Cash Account Selector (If CASH) */}
          {method === 'CASH' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>KASA HESABI *</Text>
              <View style={styles.accountPills}>
                {cashAccounts.map((acc) => {
                  const isSel = selectedCashAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountPill,
                        {
                          backgroundColor: isSel ? '#eff6ff' : theme.colors.surfaceCard,
                          borderColor: isSel ? '#2563eb' : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => setSelectedCashAccountId(acc.id)}
                    >
                      <Ionicons name="wallet-outline" size={14} color={isSel ? '#2563eb' : theme.colors.textMuted} />
                      <Text style={[styles.accountPillText, { color: isSel ? '#2563eb' : theme.colors.text }]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Bank Account Selector (If CREDIT_CARD or BANK_TRANSFER) */}
          {(method === 'CREDIT_CARD' || method === 'BANK_TRANSFER') && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>BANKA HESABI *</Text>
              <View style={styles.accountPills}>
                {bankAccounts.map((acc) => {
                  const isSel = selectedBankAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountPill,
                        {
                          backgroundColor: isSel ? '#eff6ff' : theme.colors.surfaceCard,
                          borderColor: isSel ? '#2563eb' : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => setSelectedBankAccountId(acc.id)}
                    >
                      <Ionicons name="business-outline" size={14} color={isSel ? '#2563eb' : theme.colors.textMuted} />
                      <Text style={[styles.accountPillText, { color: isSel ? '#2563eb' : theme.colors.text }]}>
                        {acc.bankName || acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Check Details Section (If CHECK) */}
          {method === 'CHECK' && (
            <View style={[styles.checkSection, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.checkSectionTitle, { color: theme.colors.text }]}>Çek Bilgileri & Fotoğraf</Text>

              <View style={styles.checkInputRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
                  placeholder="Banka Adı"
                  placeholderTextColor={theme.colors.textMuted}
                  value={checkBankName}
                  onChangeText={setCheckBankName}
                />
                <TextInput
                  style={[styles.textInput, { flex: 1, backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
                  placeholder="Çek No"
                  placeholderTextColor={theme.colors.textMuted}
                  value={checkNumber}
                  onChangeText={setCheckNumber}
                />
              </View>

              <TextInput
                style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.borderSubtle, marginTop: 8 }]}
                placeholder="Çek Vade Tarihi (GG.AA.YYYY)"
                placeholderTextColor={theme.colors.textMuted}
                value={checkDueDate}
                onChangeText={setCheckDueDate}
              />

              {/* Check Photos Thumbnails & Capture Button */}
              <View style={styles.photoRow}>
                {checkFrontPhoto ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: checkFrontPhoto }} style={styles.photoThumb} />
                    <Text style={styles.photoThumbLabel}>Ön Yüz ✓</Text>
                  </View>
                ) : null}

                {checkBackPhoto ? (
                  <View style={styles.photoThumbWrap}>
                    <Image source={{ uri: checkBackPhoto }} style={styles.photoThumb} />
                    <Text style={styles.photoThumbLabel}>Arka Yüz ✓</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.captureBtn, { borderColor: theme.colors.primary }]}
                  onPress={() => setIsCheckCameraOpen(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
                  <Text style={[styles.captureBtnText, { color: theme.colors.primary }]}>
                    {checkFrontPhoto || checkBackPhoto ? 'Fotoğrafları Güncelle' : 'Çek Ön/Arka Fotoğrafı Ekle'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Invoice Allocation Section */}
          {openInvoices.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                FATURA EŞLEŞTİRME ({allocatedInvoiceIds.size}/{openInvoices.length} Seçili)
              </Text>
              <Text style={[styles.subHint, { color: theme.colors.textMuted }]}>
                Tahsilatı carinin açık faturalarıyla doğrudan eşleştirebilirsiniz:
              </Text>
              {openInvoices.map((inv) => {
                const isSelected = allocatedInvoiceIds.has(inv.id);
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={[
                      styles.allocCard,
                      {
                        backgroundColor: isSelected ? '#eff6ff' : theme.colors.surfaceCard,
                        borderColor: isSelected ? '#2563eb' : theme.colors.borderSubtle,
                      },
                    ]}
                    onPress={() => toggleInvoiceAllocation(inv)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? '#2563eb' : theme.colors.textMuted}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.allocInvoiceNo, { color: theme.colors.text }]}>{inv.number}</Text>
                      <Text style={[styles.allocDate, { color: theme.colors.textMuted }]}>
                        Vade: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('tr-TR') : '-'}
                      </Text>
                    </View>
                    <Text style={[styles.allocAmount, { color: theme.colors.text }]}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: inv.currencyCode }).format(inv.totalGross)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Reference & Notes */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>MAKBUZ / SERİ NO</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.colors.surfaceCard, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
              placeholder="Örn: TKM-00129"
              placeholderTextColor={theme.colors.textMuted}
              value={reference}
              onChangeText={setReference}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>AÇIKLAMA / NOT</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput, { backgroundColor: theme.colors.surfaceCard, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
              placeholder="Tahsilat açıklaması veya saha yetkilisi notu..."
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Bottom Save Action Bar */}
        <View style={[styles.footerBar, { borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceCard }]}>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
                <Text style={styles.submitBtnText}>Tahsilatı Kaydet ve Makbuz Kes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Check Photo Capture Sub-Modal */}
        <CheckPhotoCaptureModal
          visible={isCheckCameraOpen}
          onClose={() => setIsCheckCameraOpen(false)}
          onSavePhotos={(photos) => {
            if (photos.frontUri) setCheckFrontPhoto(photos.frontUri);
            if (photos.backUri) setCheckBackPhoto(photos.backUri);
          }}
          initialFrontUri={checkFrontPhoto}
          initialBackUri={checkBackPhoto}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  methodCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  methodText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  subHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  contactDropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  accountPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  checkSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  checkInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
  },
  notesInput: {
    height: 64,
    textAlignVertical: 'top',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  photoThumbWrap: {
    alignItems: 'center',
  },
  photoThumb: {
    width: 64,
    height: 40,
    borderRadius: 6,
  },
  photoThumbLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 2,
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  captureBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  allocCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  allocInvoiceNo: {
    fontSize: 13,
    fontWeight: '600',
  },
  allocDate: {
    fontSize: 11,
  },
  allocAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
