import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActionableEntity } from '../../services/chat.service';

interface CopilotActionPillProps {
  entity: ActionableEntity;
  onPress: (entity: ActionableEntity) => void;
}

export const CopilotActionPill: React.FC<CopilotActionPillProps> = ({
  entity,
  onPress,
}) => {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress(entity);
  };

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      <View style={styles.leftContent}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={entity.icon as unknown as keyof typeof Ionicons.glyphMap}
            size={14}
            color="#38BDF8"
          />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {entity.label}
        </Text>
      </View>

      <View style={styles.rightContent}>
        {entity.badge && (
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText}>{entity.badge}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color="#64748B" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginVertical: 3,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#F1F5F9',
    flexShrink: 1,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  badgeWrap: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
  },
});
