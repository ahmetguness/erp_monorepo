import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Warehouse } from '../../services/inventory.service';

export interface WarehouseSelectorModalProps {
  visible: boolean;
  warehouses: Warehouse[];
  selectedId: string | null;
  disabledId?: string | null;
  title?: string;
  onSelect: (warehouse: Warehouse) => void;
  onClose: () => void;
}

export const WarehouseSelectorModal: React.FC<WarehouseSelectorModalProps> = ({
  visible,
  warehouses,
  selectedId,
  disabledId,
  title = 'Depo Seçin',
  onSelect,
  onClose,
}) => {
  const { theme } = useTheme();

  const handleSelect = (item: Warehouse) => {
    if (item.id === disabledId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect(item);
    onClose();
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
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.colors.primaryMuted },
              ]}
            >
              <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {title}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* List */}
        <FlatList
          data={warehouses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            const isDisabled = item.id === disabledId;

            return (
              <TouchableOpacity
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primaryMuted
                      : theme.colors.surfaceCard,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.borderSubtle,
                    opacity: isDisabled ? 0.45 : 1,
                  },
                ]}
                disabled={isDisabled}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.itemLeft}>
                  <View
                    style={[
                      styles.whIcon,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.borderSubtle,
                      },
                    ]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={18}
                      color={isSelected ? '#ffffff' : theme.colors.textSecondary}
                    />
                  </View>

                  <View style={styles.whInfo}>
                    <Text
                      style={[
                        styles.whName,
                        {
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          fontWeight: isSelected ? '700' : '600',
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={[styles.whCode, { color: theme.colors.textMuted }]}>
                      Kod: {item.code} {item.address ? `• ${item.address}` : ''}
                    </Text>
                  </View>
                </View>

                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                )}
                {isDisabled && (
                  <Text style={[styles.disabledLabel, { color: theme.colors.textMuted }]}>
                    Seçili Çıkış
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={40} color={theme.colors.textMuted} />
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                Tanımlı depo bulunamadı.
              </Text>
            </View>
          }
        />
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
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  whIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whInfo: {
    flex: 1,
  },
  whName: {
    fontSize: 15,
  },
  whCode: {
    fontSize: 12,
    marginTop: 2,
  },
  disabledLabel: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
  },
});
