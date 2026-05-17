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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/auth.store';
import { sendChatMessage, clearChatHistory } from '../services/chat.service';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  usedData?: boolean;
  error?: boolean;
}

// ─────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────

const QUICK_ACTIONS: readonly { label: string; message: string }[] = [
  { label: '📋 Aksiyon merkezi', message: 'Bugünkü en önemli aksiyonları sırala: kritik stok, gecikmiş faturalar, bekleyen ödemeler' },
  { label: '📦 Satın alma taslağı', message: 'Stokta kritik ürünleri bul ve bunlar için taslak satın alma talebi oluştur' },
  { label: '💸 Gecikmiş tahsilat', message: 'Vadesi geçmiş faturaları listele ve müşterilere gönderilecek kısa hatırlatma metni hazırla' },
  { label: '📊 Nakit akışı riski', message: 'Bu ay gelir, gider, bekleyen ödeme ve gecikmiş faturaya göre nakit akışı riskini yorumla' },
] as const;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────
// ChatBot Component
// ─────────────────────────────────────────────

export function ChatBot() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // ── Welcome message ──
  useEffect(() => {
    if (messages.length === 0) {
      const name = user?.name?.split(' ')[0] ?? 'Merhaba';
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Merhaba ${name}! 👋 Ben Axon ERP asistanınızım. Cari hesaplar, faturalar, stok ve raporlar hakkında sorularınızı yanıtlayabilirim.`,
        timestamp: new Date(),
      }]);
    }
  }, [user, messages.length]);

  // ── Open/Close animation ──
  const openChat = useCallback(() => {
    setIsOpen(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const closeChat = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIsOpen(false));
  }, [slideAnim]);

  // ── Send message ──
  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(msg);
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.output || 'Yanıt alınamadı.',
        timestamp: new Date(),
        usedData: response.usedTools,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Üzgünüm, şu an yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.',
        timestamp: new Date(),
        error: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  // ── Clear chat ──
  const handleClear = useCallback(async () => {
    const name = user?.name?.split(' ')[0] ?? 'Merhaba';
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Sohbet temizlendi. Size nasıl yardımcı olabilirim, ${name}?`,
      timestamp: new Date(),
    }]);
    try {
      await clearChatHistory();
    } catch {
      // sessizce geç
    }
  }, [user]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const showQuickActions = messages.length <= 1 && !isLoading;

  // ── Render message ──
  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={[styles.msgAvatar, item.error ? styles.msgAvatarError : styles.msgAvatarBot]}>
            <Ionicons
              name={item.error ? 'alert-circle' : 'sparkles'}
              size={14}
              color={item.error ? '#EF4444' : '#94A3B8'}
            />
          </View>
        )}
        <View style={[
          styles.msgBubble,
          isUser ? styles.msgBubbleUser : (item.error ? styles.msgBubbleError : styles.msgBubbleBot),
        ]}>
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>{item.content}</Text>
          <View style={styles.msgMeta}>
            {item.usedData && (
              <View style={styles.dataTag}>
                <Ionicons name="server-outline" size={9} color="#3B82F6" />
                <Text style={styles.dataTagText}>ERP verisi</Text>
              </View>
            )}
            <Text style={styles.msgTime}>
              {item.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
        {isUser && (
          <View style={styles.msgAvatarUser}>
            <Ionicons name="person" size={14} color="#3B82F6" />
          </View>
        )}
      </View>
    );
  }, []);

  // ── FAB (Closed state) ──
  if (!isOpen) {
    return (
      <TouchableOpacity style={styles.fab} onPress={openChat} activeOpacity={0.85}>
        <Ionicons name="chatbubble-ellipses" size={26} color="#ffffff" />
        <View style={styles.fabDot} />
      </TouchableOpacity>
    );
  }

  // ── Full Chat UI ──
  return (
    <Animated.View style={[styles.chatContainer, { transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.chatHeader}>
          <View style={styles.chatHeaderLeft}>
            <View style={styles.botIcon}>
              <Ionicons name="sparkles" size={16} color="#ffffff" />
              <View style={styles.botDot} />
            </View>
            <View>
              <Text style={styles.chatTitle}>Axon Asistan</Text>
              <Text style={styles.chatSubtitle} numberOfLines={1}>
                {tenant?.companyName ?? 'ERP Asistanı'}
              </Text>
            </View>
          </View>
          <View style={styles.chatHeaderRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClear}>
              <Ionicons name="trash-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={closeChat}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {/* Quick Actions */}
              {showQuickActions && (
                <View style={styles.quickActions}>
                  <View style={styles.quickActionsLabel}>
                    <Ionicons name="flash" size={12} color="#3B82F6" />
                    <Text style={styles.quickActionsText}>AKSIYON AKIŞLARI</Text>
                  </View>
                  <View style={styles.quickActionsGrid}>
                    {QUICK_ACTIONS.map((q) => (
                      <TouchableOpacity
                        key={q.label}
                        style={styles.quickActionBtn}
                        onPress={() => handleSend(q.message)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickActionText}>{q.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <View style={styles.loadingRow}>
                  <View style={styles.msgAvatarBot}>
                    <Ionicons name="sparkles" size={14} color="#94A3B8" />
                  </View>
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={styles.loadingText}>Düşünüyor...</Text>
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Cari sorgula, rapor iste..."
              placeholderTextColor="#64748B"
              editable={!isLoading}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!input.trim() || isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="send" size={16} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>Axon AI — ERP verilerinize erişerek yanıt verir</Text>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

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
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  fabDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },

  // Chat Container
  chatContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    zIndex: 200,
  },
  keyboardView: {
    flex: 1,
  },

  // Header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  chatSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  chatHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Messages
  messagesList: {
    padding: 16,
    gap: 12,
    paddingBottom: 8,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  msgAvatarBot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarError: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  msgAvatarUser: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  msgBubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  msgBubbleUser: {
    backgroundColor: '#0EA5E9',
    borderBottomRightRadius: 4,
  },
  msgBubbleBot: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  msgBubbleError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  msgText: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  msgTextUser: {
    color: '#ffffff',
  },
  msgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dataTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dataTagText: {
    fontSize: 9,
    color: '#3B82F6',
    fontWeight: '600',
  },
  msgTime: {
    fontSize: 10,
    color: '#475569',
  },

  // Quick Actions
  quickActions: {
    paddingTop: 8,
  },
  quickActionsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  quickActionsText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '48%',
    flexGrow: 1,
  },
  quickActionText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  loadingBubble: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },

  // Input Bar
  inputBar: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 12,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#F1F5F9',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  disclaimer: {
    fontSize: 9,
    color: '#334155',
    textAlign: 'center',
    marginTop: 6,
  },
});
