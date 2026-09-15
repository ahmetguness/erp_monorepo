import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { ScreenWrapper } from '../components/common/ScreenWrapper';
import { Header } from '../components/common/Header';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import { useNotificationStore } from '../store/notification.store';
import { NotificationItem } from '../services/notification.service';
import { RootStackParamList } from '../types/navigation.types';
import { formatDateTime } from '../lib/utils';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const {
    notifications,
    unreadCount,
    isLoading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = useCallback(() => {
    loadNotifications();
  }, [loadNotifications]);

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'UNREAD') return item.status === 'UNREAD';
    return true;
  });

  const handleMarkAllRead = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await markAllAsRead();
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (item.status === 'UNREAD') {
      await markAsRead(item.id);
    }

    if (item.module === 'approvals') {
      navigation.navigate('Main', { screen: 'ApprovalsTab' });
    } else if (item.module === 'inventory' || item.module === 'stock') {
      navigation.navigate('Main', { screen: 'InventoryTab' });
    } else if (item.module === 'invoicing' || item.module === 'sales') {
      navigation.navigate('Main', { screen: 'SalesTab' });
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = item.status === 'UNREAD';

    let iconName: keyof typeof Ionicons.glyphMap = 'notifications-outline';
    let iconColor = theme.colors.primary;
    let iconBg = theme.colors.primaryMuted;

    if (item.module === 'invoicing') {
      iconName = 'receipt-outline';
      iconColor = '#2563eb';
      iconBg = '#eff6ff';
    } else if (item.module === 'approvals') {
      iconName = 'shield-checkmark-outline';
      iconColor = '#f59e0b';
      iconBg = '#fffbeb';
    } else if (item.module === 'inventory' || item.module === 'stock') {
      iconName = 'cube-outline';
      iconColor = '#0ea5e9';
      iconBg = '#f0f9ff';
    }

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleNotificationPress(item)}
        style={[
          styles.itemCard,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: isUnread ? theme.colors.primary : theme.colors.borderSubtle,
            borderLeftWidth: isUnread ? 4 : 1,
            borderRadius: theme.borderRadius.md,
            ...theme.shadows.sm,
          },
        ]}
      >
        <View
          style={[
            styles.itemIcon,
            {
              backgroundColor: iconBg,
              borderRadius: theme.borderRadius.md,
            },
          ]}
        >
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text
              style={[
                styles.itemTitle,
                {
                  color: theme.colors.text,
                  fontWeight: isUnread ? '700' : '600',
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {isUnread && (
              <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />
            )}
          </View>

          {item.message ? (
            <Text
              style={[
                styles.itemMessage,
                { color: theme.colors.textSecondary },
              ]}
              numberOfLines={2}
            >
              {item.message}
            </Text>
          ) : null}

          <View style={styles.itemFooter}>
            <Text style={[styles.itemDate, { color: theme.colors.textMuted }]}>
              {formatDateTime(item.createdAt)}
            </Text>
            {item.module && (
              <Badge
                label={item.module.toUpperCase()}
                variant="neutral"
                size="sm"
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper scrollable={false}>
      {/* Header */}
      <Header
        title="Bildirimler"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              style={styles.headerActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="checkmark-done-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.headerActionText, { color: theme.colors.primary }]}>
                Tümü Okundu
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.colors.borderSubtle }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setFilter('ALL');
          }}
          style={[
            styles.tabButton,
            filter === 'ALL' && [
              styles.tabActive,
              { backgroundColor: theme.colors.surfaceCard, ...theme.shadows.sm },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  filter === 'ALL'
                    ? theme.colors.text
                    : theme.colors.textSecondary,
                fontWeight: filter === 'ALL' ? '700' : '500',
              },
            ]}
          >
            Tümü ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setFilter('UNREAD');
          }}
          style={[
            styles.tabButton,
            filter === 'UNREAD' && [
              styles.tabActive,
              { backgroundColor: theme.colors.surfaceCard, ...theme.shadows.sm },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  filter === 'UNREAD'
                    ? theme.colors.primary
                    : theme.colors.textSecondary,
                fontWeight: filter === 'UNREAD' ? '700' : '500',
              },
            ]}
          >
            Okunmamış ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {isLoading && notifications.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
            Bildirimler yükleniyor...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={filter === 'UNREAD' ? 'Okunmamış Bildirim Yok' : 'Bildirim Bulunamadı'}
              description={
                filter === 'UNREAD'
                  ? 'Harika! Tüm bildirimleri okudunuz.'
                  : 'Henüz gelen yeni bir bildirim bulunmuyor.'
              }
              icon="notifications-off-outline"
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabActive: {},
  tabText: {
    fontSize: 13,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  itemDate: {
    fontSize: 11,
    fontWeight: '500',
  },
});
