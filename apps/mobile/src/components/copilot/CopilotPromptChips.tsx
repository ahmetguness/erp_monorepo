import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PROMPT_CATEGORIES, PromptCategory } from '../../services/chat.service';

interface CopilotPromptChipsProps {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
}

export const CopilotPromptChips: React.FC<CopilotPromptChipsProps> = ({
  onSelectPrompt,
  disabled = false,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  const handleChipPress = (prompt: string) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectPrompt(prompt);
  };

  const categories = [
    { id: 'all', label: 'Tümü', icon: 'apps-outline' },
    ...PROMPT_CATEGORIES,
  ];

  // Filter prompts according to category
  const visiblePrompts: { text: string; categoryLabel: string; icon: string }[] = [];

  if (selectedCategoryId === 'all') {
    PROMPT_CATEGORIES.forEach((cat) => {
      cat.prompts.forEach((p) => {
        visiblePrompts.push({ text: p, categoryLabel: cat.label, icon: cat.icon });
      });
    });
  } else {
    const matched = PROMPT_CATEGORIES.find((c) => c.id === selectedCategoryId);
    if (matched) {
      matched.prompts.forEach((p) => {
        visiblePrompts.push({ text: p, categoryLabel: matched.label, icon: matched.icon });
      });
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="sparkles" size={13} color="#38BDF8" />
          <Text style={styles.headerTitle}>ÖNERİLEN ERP SORGULARI</Text>
        </View>
        <Text style={styles.headerSubtitle}>Tek tıkla çalıştırın</Text>
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryTab, isActive && styles.categoryTabActive]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSelectedCategoryId(cat.id);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.icon as unknown as keyof typeof Ionicons.glyphMap}
                size={13}
                color={isActive ? '#0EA5E9' : '#94A3B8'}
              />
              <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Prompt Chips Grid */}
      <View style={styles.promptsGrid}>
        {visiblePrompts.map((item, idx) => (
          <TouchableOpacity
            key={`prompt-${idx}`}
            style={[styles.promptCard, disabled && styles.promptCardDisabled]}
            onPress={() => handleChipPress(item.text)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <View style={styles.promptCardTop}>
              <View style={styles.categoryBadge}>
                <Ionicons
                  name={item.icon as unknown as keyof typeof Ionicons.glyphMap}
                  size={11}
                  color="#38BDF8"
                />
                <Text style={styles.categoryBadgeText}>{item.categoryLabel}</Text>
              </View>
              <Ionicons name="arrow-forward-circle-outline" size={16} color="#64748B" />
            </View>
            <Text style={styles.promptText}>{item.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  categoryScroll: {
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 2,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryTabActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderColor: '#0EA5E9',
  },
  categoryTabText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  promptsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptCard: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    width: '48.5%',
    flexGrow: 1,
    gap: 6,
  },
  promptCardDisabled: {
    opacity: 0.5,
  },
  promptCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F172A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  promptText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#F1F5F9',
    lineHeight: 17,
  },
});
