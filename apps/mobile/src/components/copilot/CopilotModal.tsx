import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Keyboard,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../types/navigation.types';
import { useAuthStore } from '../../store/auth.store';
import {
  sendChatMessage,
  clearChatHistory,
  parseAssistantResponse,
  ActionableEntity,
  ChatPageContext,
} from '../../services/chat.service';
import { CopilotMessageBubble, CopilotMessage } from './CopilotMessageBubble';
import { CopilotPromptChips } from './CopilotPromptChips';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CopilotModalProps {
  initialPrompt?: string;
  context?: ChatPageContext;
  showFloatingButton?: boolean;
  isOpenControlled?: boolean;
  onCloseControlled?: () => void;
}

export const CopilotModal: React.FC<CopilotModalProps> = ({
  initialPrompt,
  context,
  showFloatingButton = true,
  isOpenControlled,
  onCloseControlled,
}) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);

  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isControlled = isOpenControlled !== undefined;
  const isOpen = isControlled ? isOpenControlled : isOpenInternal;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const flatListRef = useRef<FlatList<CopilotMessage>>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // ── Welcome Message ──
  useEffect(() => {
    if (messages.length === 0) {
      const firstName = user?.name?.split(' ')[0] ?? 'Yönetici';
      const company = tenant?.companyName ?? 'Axon ERP';

      setMessages([
        {
          id: 'welcome-msg',
          role: 'assistant',
          content: `Merhaba ${firstName}! 👋 Ben **Axon Copilot**.\n\n${company} sisteminizdeki **finansal durumlar, kritik stoklar, satış siparişleri, saha servisleri ve çalışan kayıtları** hakkında sorularınızı yanıtlayabilir veya işlemlere doğrudan yönlendirebilirim.`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [user, tenant, messages.length]);

  // ── Initial Prompt Trigger ──
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim().length > 0 && isOpen) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  // ── Open/Close Animation ──
  const openChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!isControlled) {
      setIsOpenInternal(true);
    }
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  }, [slideAnim, isControlled]);

  const closeChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      if (isControlled) {
        onCloseControlled?.();
      } else {
        setIsOpenInternal(false);
      }
    });
  }, [slideAnim, isControlled, onCloseControlled]);

  useEffect(() => {
    if (isControlled) {
      if (isOpenControlled) {
        openChat();
      } else {
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [isControlled, isOpenControlled, openChat, slideAnim]);

  // ── Send Message ──
  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? input).trim();
      if (!query || isLoading) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const userMessage: CopilotMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: query,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const response = await sendChatMessage(query, context);
        const parsed = parseAssistantResponse(response.output || 'Bilgi bulunamadı.');

        const assistantMessage: CopilotMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: parsed.cleanText,
          timestamp: new Date(),
          usedData: response.usedTools,
          suggestions: parsed.suggestions,
          actionEntities: parsed.actionEntities,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: unknown) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              '⚠️ Üzgünüm, şu an ERP veri tabanına erişirken bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.',
            timestamp: new Date(),
            error: true,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, context],
  );

  // ── Clear Conversation ──
  const handleClear = useCallback(() => {
    Alert.alert(
      'Sohbeti Temizle',
      'Tüm konuşma geçmişi sunucudan ve ekrandan temizlenecek. Devam etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            const firstName = user?.name?.split(' ')[0] ?? 'Yönetici';
            setMessages([
              {
                id: `welcome-${Date.now()}`,
                role: 'assistant',
                content: `Sohbet geçmişi temizlendi. Nasıl yardımcı olabilirim, ${firstName}?`,
                timestamp: new Date(),
              },
            ]);
            try {
              await clearChatHistory();
            } catch {
              // Ignore server error
            }
          },
        },
      ],
    );
  }, [user]);

  // ── Action Navigation Handler (9.3) ──
  const handleActionNavigation = useCallback(
    (entity: ActionableEntity) => {
      closeChat();

      setTimeout(() => {
        try {
          switch (entity.targetScreen) {
            case 'Finance':
              navigation.navigate('Finance', entity.params as { initialTab?: 'overdue' | 'payments' | 'edocuments'; contactId?: string } | undefined);
              break;
            case 'SalesTab':
              navigation.navigate('Main', { screen: 'SalesTab' } as unknown as undefined);
              break;
            case 'InventoryTab':
              navigation.navigate('Main', { screen: 'InventoryTab' } as unknown as undefined);
              break;
            case 'FieldService':
              navigation.navigate('FieldService');
              break;
            case 'ProductionShopFloor':
              navigation.navigate('ProductionShopFloor');
              break;
            case 'EmployeePortal':
              navigation.navigate('EmployeePortal', entity.params as { initialTab?: 'leaves' | 'shifts' | 'payrolls' } | undefined);
              break;
            default:
              break;
          }
        } catch (e) {
          console.warn('[CopilotModal] Navigation error:', e);
        }
      }, 300);
    },
    [closeChat, navigation],
  );

  // Auto-scroll on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const showPromptChips = messages.length <= 1 && !isLoading;

  // ── FAB (Floating Button) ──
  if (!isOpen && showFloatingButton) {
    return (
      <TouchableOpacity
        style={styles.fab}
        onPress={openChat}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
        <View style={styles.fabDot} />
      </TouchableOpacity>
    );
  }

  if (!isOpen && !showFloatingButton) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.botIconWrap}>
              <Ionicons name="sparkles" size={17} color="#FFFFFF" />
              <View style={styles.onlineDot} />
            </View>
            <View>
              <View style={styles.titleBadgeRow}>
                <Text style={styles.title}>Axon Copilot</Text>
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>AI ASİSTAN</Text>
                </View>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {tenant?.companyName ?? 'Enterprise ERP'} • Canlı Veri
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={closeChat}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Message List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CopilotMessageBubble
              message={item}
              onSelectSuggestion={handleSend}
              onNavigateAction={handleActionNavigation}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {/* Quick Prompt Chips (9.2) */}
              {showPromptChips && (
                <CopilotPromptChips
                  onSelectPrompt={handleSend}
                  disabled={isLoading}
                />
              )}

              {/* Thinking / Loading State */}
              {isLoading && (
                <View style={styles.loadingRow}>
                  <View style={styles.avatarBotLoading}>
                    <Ionicons name="sparkles" size={14} color="#38BDF8" />
                  </View>
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator size="small" color="#38BDF8" />
                    <Text style={styles.loadingText}>Axon ERP verileri taranıyor...</Text>
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* Input Bar */}
        <View style={styles.inputArea}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Fatura, stok, sipariş veya rapor sor..."
              placeholderTextColor="#64748B"
              editable={!isLoading}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!input.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || isLoading}
              activeOpacity={0.75}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimerText}>
            Axon AI — Kurumsal verileriniz şifrelenir ve gizlilik standartlarına uygundur
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  fabDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A',
  },

  // Modal Overlay
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    zIndex: 200,
  },
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  aiTag: {
    backgroundColor: 'rgba(14, 165, 233, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  aiTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Message list
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 16,
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  avatarBotLoading: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Input Area
  inputArea: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 14,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  disclaimerText: {
    fontSize: 9.5,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
  },
});
