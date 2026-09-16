import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  CheckNoteType,
  CreateCheckNoteInput,
  createCheckPromissoryNote,
  CheckPromissoryNote,
} from '../../services/finance.service';
import { getContacts, ContactListItem } from '../../services/contact.service';
import { CheckPhotoCaptureModal } from './CheckPhotoCaptureModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (created: CheckPromissoryNote) => void;
  onSuccess?: () => void;
  initialContactId?: string;
}

const POPULAR_BANKS = [
  'Garanti BBVA',
  'İş Bankası',
  'Yapı Kredi',
  'Akbank',
  'Ziraat Bankası',
  'VakıfBank',
  'QNB Finansbank',
];

export const CreateCheckModal: React.FC<Props> = ({
  visible,
  onClose,
  onCreated,
  onSuccess,
  initialContactId,
}) => {
  const { theme } = useTheme();

  const [type, setType] = useState<CheckNoteType>('CHECK');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('TRY');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDateDays, setDueDateDays] = useState(30);

  // Photos
  const [frontUri, setFrontUri] = useState<string | undefined>();
  const [backUri, setBackUri] = useState<string | undefined>();
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Contact picker
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactListItem | null>(null);
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setType('CHECK');
      setNumber('');
      setAmount('');
      setCurrencyCode('TRY');
      setBankName('');
      setNotes('');
      setDueDateDays(30);
      setFrontUri(undefined);
      setBackUri(undefined);
      setSelectedContact(null);
      setIsSubmitting(false);

      getContacts({ limit: 50 }).then((res) => {
        setContacts(res.items);
        if (initialContactId) {
          const match = res.items.find((c) => c.id === initialContactId);
          if (match) setSelectedContact(match);
        }
      });
    }
  }, [visible, initialContactId]);

  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + dueDateDays);
  const dueDate = dueDateObj.toISOString().split('T')[0];

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!number.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen evrak/çek numarasını giriniz.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir tutar giriniz.');
      return;
    }

    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + dueDateDays);

    const payload: CreateCheckNoteInput = {
      type,
      number: number.trim().toUpperCase(),
      amount: parsedAmount,
      currencyCode,
      issueDate: today.toISOString().split('T')[0],
      dueDate: due.toISOString().split('T')[0],
      bankName: bankName.trim() || undefined,
      contactId: selectedContact?.id,
      notes: notes.trim() || undefined,
      frontPhotoUri: frontUri,
      backPhotoUri: backUri,
    };

    setIsSubmitting(true);
    try {
      const result = await createCheckPromissoryNote(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Kayıt Başarılı',
        `"${result.number}" numaralı ${type === 'CHECK' ? 'çek' : 'senet'} portföye eklendi.`
      );
      if (onCreated) onCreated(result);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Kayıt oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <>
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
            <View>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Yeni Çek / Senet Girişi
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Portföye alınan ödeme evrakını kaydedin
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Type Selector (ÇEK vs SENET) */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                EVRAK TÜRÜ
              </Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: type === 'CHECK' ? theme.colors.primary : theme.colors.surface,
                      borderColor: type === 'CHECK' ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setType('CHECK');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="document-text"
                    size={16}
                    color={type === 'CHECK' ? '#ffffff' : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      { color: type === 'CHECK' ? '#ffffff' : theme.colors.text },
                    ]}
                  >
                    Banka Çeki
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: type === 'PROMISSORY_NOTE' ? theme.colors.primary : theme.colors.surface,
                      borderColor: type === 'PROMISSORY_NOTE' ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setType('PROMISSORY_NOTE');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="receipt"
                    size={16}
                    color={type === 'PROMISSORY_NOTE' ? '#ffffff' : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      { color: type === 'PROMISSORY_NOTE' ? '#ffffff' : theme.colors.text },
                    ]}
                  >
                    Borç Senedi
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Document Number & Amount */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                EVRAK VE TUTAR BİLGİLERİ
              </Text>

              {/* Number */}
              <View style={styles.fieldWrap}>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                  {type === 'CHECK' ? 'Çek Seri / No *' : 'Senet Numarası *'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    },
                  ]}
                  placeholder={type === 'CHECK' ? 'Örn: CK-2026-0042' : 'Örn: SNT-0091'}
                  placeholderTextColor={theme.colors.textMuted}
                  value={number}
                  onChangeText={setNumber}
                />
              </View>

              {/* Amount & Currency */}
              <View style={styles.amountCurrencyRow}>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Tutar *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        fontWeight: '700',
                      },
                    ]}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Para Birimi</Text>
                  <View style={styles.currencyToggleRow}>
                    {['TRY', 'USD', 'EUR'].map((cur) => (
                      <TouchableOpacity
                        key={cur}
                        style={[
                          styles.curChip,
                          {
                            backgroundColor: currencyCode === cur ? theme.colors.primary : theme.colors.surface,
                            borderColor: currencyCode === cur ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                        onPress={() => setCurrencyCode(cur)}
                      >
                        <Text
                          style={[
                            styles.curChipText,
                            { color: currencyCode === cur ? '#ffffff' : theme.colors.text },
                          ]}
                        >
                          {cur}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* Contact / Keşideci Picker */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                KEŞİDECİ / CARİ MÜŞTERİ
              </Text>

              <TouchableOpacity
                style={[
                  styles.contactPickerTrigger,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setContactPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-outline" size={18} color={theme.colors.textMuted} />
                <Text
                  style={[
                    styles.contactPickerText,
                    { color: selectedContact ? theme.colors.text : theme.colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {selectedContact ? selectedContact.name : 'Keşideci / Cari Seçin (Opsiyonel)'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Bank Name (especially for checks) */}
            {type === 'CHECK' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.colors.surfaceCard,
                    borderColor: theme.colors.borderSubtle,
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                  BANKA ADI
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    },
                  ]}
                  placeholder="Banka adını yazın veya aşağıdaki listeden seçin..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={bankName}
                  onChangeText={setBankName}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bankChips}>
                  {POPULAR_BANKS.map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={[
                        styles.bankChip,
                        {
                          backgroundColor: bankName === b ? theme.colors.primary : theme.colors.surface,
                          borderColor: bankName === b ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                      onPress={() => setBankName(b)}
                    >
                      <Text
                        style={[
                          styles.bankChipText,
                          { color: bankName === b ? '#ffffff' : theme.colors.text },
                        ]}
                      >
                        {b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Vade Seçimi */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                VADE TARİHİ (HESAPLANAN: {dueDate})
              </Text>

              <View style={styles.daysRow}>
                {[15, 30, 45, 60, 90, 120].map((d) => {
                  const isSelected = dueDateDays === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                      onPress={() => setDueDateDays(d)}
                    >
                      <Text
                        style={[
                          styles.dayChipText,
                          { color: isSelected ? '#ffffff' : theme.colors.text },
                        ]}
                      >
                        {d} Gün
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Ön / Arka Fotoğraf Çekimi */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.photoHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                  EVRAK GÖRSELLERİ (ÖN & ARKA YÜZ)
                </Text>
                <TouchableOpacity
                  style={[styles.photoBtn, { backgroundColor: theme.colors.primaryMuted }]}
                  onPress={() => setPhotoModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={15} color={theme.colors.primary} />
                  <Text style={[styles.photoBtnText, { color: theme.colors.primary }]}>
                    {frontUri || backUri ? 'Yeniden Çek' : 'Fotoğraf Çek'}
                  </Text>
                </TouchableOpacity>
              </View>

              {frontUri || backUri ? (
                <View style={styles.photoPreviewRow}>
                  {frontUri && (
                    <View style={styles.photoCol}>
                      <Text style={[styles.photoLabel, { color: theme.colors.textMuted }]}>Ön Yüz</Text>
                      <Image source={{ uri: frontUri }} style={styles.photoThumb} resizeMode="cover" />
                    </View>
                  )}
                  {backUri && (
                    <View style={styles.photoCol}>
                      <Text style={[styles.photoLabel, { color: theme.colors.textMuted }]}>Arka Yüz (Ciro)</Text>
                      <Image source={{ uri: backUri }} style={styles.photoThumb} resizeMode="cover" />
                    </View>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.emptyPhotoBox, { borderColor: theme.colors.borderSubtle }]}
                  onPress={() => setPhotoModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera" size={24} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyPhotoText, { color: theme.colors.textMuted }]}>
                    Çekin veya senedin ön ve ciro yüzünü kamerayla çekin
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Notes */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>AÇIKLAMA</Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Evrak teslim notu veya cirolayan kişi bilgisi..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>
          </ScrollView>

          {/* Footer Submit */}
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
              style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Portföye Kaydet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Check Photo Capture Modal */}
      <CheckPhotoCaptureModal
        visible={photoModalVisible}
        onClose={() => setPhotoModalVisible(false)}
        initialFrontUri={frontUri}
        initialBackUri={backUri}
        onSavePhotos={(photos) => {
          setFrontUri(photos.frontUri);
          setBackUri(photos.backUri);
        }}
      />

      {/* Contact Picker Sheet */}
      <Modal
        visible={contactPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setContactPickerVisible(false)}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.colors.background }]}
          edges={['top', 'bottom']}
        >
          <View
            style={[
              styles.header,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderBottomColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.colors.text }]}>Keşideci / Cari Seç</Text>
            <TouchableOpacity onPress={() => setContactPickerVisible(false)}>
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                },
              ]}
              placeholder="Cari adı ara..."
              placeholderTextColor={theme.colors.textMuted}
              value={contactSearch}
              onChangeText={setContactSearch}
            />
          </View>

          <ScrollView contentContainerStyle={styles.pickerList}>
            {filteredContacts.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.pickerRow,
                  {
                    backgroundColor: theme.colors.surfaceCard,
                    borderColor: theme.colors.borderSubtle,
                  },
                ]}
                onPress={() => {
                  setSelectedContact(c);
                  setContactPickerVisible(false);
                }}
              >
                <Text style={[styles.pickerRowText, { color: theme.colors.text }]}>
                  {c.name}
                </Text>
                {c.code && (
                  <Text style={[styles.pickerRowCode, { color: theme.colors.textMuted }]}>
                    {c.code}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
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
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldWrap: {
    gap: 3,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  amountCurrencyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  currencyToggleRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  curChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  curChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  contactPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  contactPickerText: {
    flex: 1,
    fontSize: 13,
  },
  bankChips: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  bankChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  bankChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  photoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  photoCol: {
    flex: 1,
    gap: 4,
  },
  photoLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  photoThumb: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  emptyPhotoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
    marginTop: 4,
  },
  emptyPhotoText: {
    fontSize: 11,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 55,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchWrap: {
    padding: 16,
  },
  pickerList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerRowText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickerRowCode: {
    fontSize: 11,
  },
});
