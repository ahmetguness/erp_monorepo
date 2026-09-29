import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { tenantChatService, TenantChatUser } from '../../services/tenant-chat.service';
import { useAuthStore } from '../../store/auth.store';
import { useTheme } from '../../design-system/hooks/useTheme';

interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDirect: (userId: string) => Promise<void>;
  onCreateGroup: (title: string, memberIds: string[]) => Promise<void>;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  visible,
  onClose,
  onSelectDirect,
  onCreateGroup,
}) => {
  const { theme, isDark } = useTheme();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [mode, setMode] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<TenantChatUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSearch('');
      setGroupTitle('');
      setSelectedUserIds([]);
      setIsLoadingUsers(true);
      tenantChatService
        .getTenantUsers()
        .then((list) => {
          // Filter out current user from selection list
          setUsers(list.filter((u) => u.userId !== currentUserId));
        })
        .finally(() => setIsLoadingUsers(false));
    }
  }, [visible, currentUserId]);

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const handleToggleSelectUser = (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleStartDirect = async (userId: string) => {
    setIsSubmitting(true);
    try {
      await onSelectDirect(userId);
      onClose();
    } catch (err) {
      Alert.alert('Hata', 'Sohbet başlatılamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim()) {
      Alert.alert('Grup Adı Gerekli', 'Lütfen grubunuz için bir başlık belirleyin.');
      return;
    }
    if (selectedUserIds.length === 0) {
      Alert.alert('Katılımcı Seçin', 'Gruba en az bir çalışma arkadaşınızı eklemelisiniz.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateGroup(groupTitle.trim(), selectedUserIds);
      onClose();
    } catch (err) {
      Alert.alert('Hata', 'Grup sohbeti oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
            Yeni Sohbet
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Mode Selector */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[
              styles.modeTab,
              mode === 'DIRECT' && [
                styles.modeTabActive,
                { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF', borderColor: theme.colors.primary },
              ],
            ]}
            onPress={() => setMode('DIRECT')}
          >
            <Ionicons
              name="person"
              size={16}
              color={mode === 'DIRECT' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'DIRECT' ? theme.colors.primary : theme.colors.textSecondary },
              ]}
            >
              Birebir
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeTab,
              mode === 'GROUP' && [
                styles.modeTabActive,
                { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF', borderColor: theme.colors.primary },
              ],
            ]}
            onPress={() => setMode('GROUP')}
          >
            <Ionicons
              name="people"
              size={16}
              color={mode === 'GROUP' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.modeTabText,
                { color: mode === 'GROUP' ? theme.colors.primary : theme.colors.textSecondary },
              ]}
            >
              Grup Sohbeti
            </Text>
          </TouchableOpacity>
        </View>

        {/* Group Title Input if in Group mode */}
        {mode === 'GROUP' && (
          <View style={styles.groupTitleWrap}>
            <TextInput
              style={[
                styles.groupTitleInput,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                  borderColor: theme.colors.borderSubtle,
                  color: theme.colors.textPrimary,
                },
              ]}
              placeholder="Grup Başlığı (örn. Saha Satış Ekibi)..."
              placeholderTextColor={theme.colors.textMuted}
              value={groupTitle}
              onChangeText={setGroupTitle}
            />
          </View>
        )}

        {/* Search Input */}
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.textPrimary }]}
              placeholder="Çalışan veya e-posta ara..."
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Users List */}
        {isLoadingUsers ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected = selectedUserIds.includes(item.userId);
              return (
                <TouchableOpacity
                  style={[
                    styles.userRow,
                    { borderBottomColor: theme.colors.borderSubtle },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (mode === 'GROUP') {
                      handleToggleSelectUser(item.userId);
                    } else {
                      handleStartDirect(item.userId);
                    }
                  }}
                >
                  <View style={[styles.avatar, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.avatarText}>
                      {item.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: theme.colors.textPrimary }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.userEmail, { color: theme.colors.textSecondary }]}>
                      {item.email} {item.roleName ? `• ${item.roleName}` : ''}
                    </Text>
                  </View>

                  {mode === 'GROUP' ? (
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                    />
                  ) : (
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color={theme.colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Eşleşen çalışma arkadaşı bulunamadı.
                </Text>
              </View>
            }
          />
        )}

        {/* Create Group Floating Submit Button */}
        {mode === 'GROUP' && (
          <View style={[styles.bottomBar, { borderTopColor: theme.colors.borderSubtle }]}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor:
                    selectedUserIds.length > 0 && groupTitle.trim().length > 0 && !isSubmitting
                      ? theme.colors.primary
                      : isDark
                      ? 'rgba(255, 255, 255, 0.1)'
                      : '#E2E8F0',
                },
              ]}
              disabled={selectedUserIds.length === 0 || !groupTitle.trim() || isSubmitting}
              onPress={handleCreateGroup}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  Grup Oluştur ({selectedUserIds.length} kişi)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modeTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeTabActive: {},
  modeTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  groupTitleWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  groupTitleInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 80,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
