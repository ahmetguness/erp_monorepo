import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { CategoryShare } from '../../../services/dashboard.service';
import { formatCurrency } from '../../../lib/utils';

export interface CategoryDonutChartProps {
  data: CategoryShare[];
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({ data }) => {
  const { theme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(330);
  const [selectedCategory, setSelectedCategory] = useState<CategoryShare | null>(
    data && data.length > 0 ? data[0] : null
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 100) {
      setContainerWidth(w);
    }
  };

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.colors.borderSubtle }]}>
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          Kategori dağılım verisi bulunamadı.
        </Text>
      </View>
    );
  }

  const totalAmount = data.reduce((acc, c) => acc + c.amount, 0) || 1;

  // Donut geometry
  const size = 140;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Compute strokeDasharray and strokeDashoffset for each segment
  let accumulatedPercent = 0;
  const segments = data.map((item) => {
    const fraction = item.amount / totalAmount;
    const strokeDasharray = `${fraction * circumference} ${circumference}`;
    // SVG circles start at 3 o'clock, rotate by -90deg so we start at 12 o'clock
    const strokeDashoffset = -accumulatedPercent * circumference;
    accumulatedPercent += fraction;

    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
      fraction,
    };
  });

  const active = selectedCategory || data[0];

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* KPI Highlight Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
          En Çok Satan İlk 5 Kategori (Son 30 Gün)
        </Text>
        <Text style={[styles.statTotal, { color: theme.colors.text }]}>
          Toplam: {formatCurrency(totalAmount)}
        </Text>
      </View>

      <View style={styles.contentRow}>
        {/* Donut Chart with Center Metric */}
        <View style={[styles.chartWrapper, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${center}, ${center}`}>
              {/* Background ring track */}
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={theme.colors.borderSubtle}
                strokeWidth={strokeWidth}
                fill="transparent"
                opacity={0.3}
              />
              {/* Category Segments */}
              {segments.map((seg, idx) => {
                const isSelected = active.name === seg.name;
                return (
                  <Circle
                    key={`donut-seg-${idx}`}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={seg.color}
                    strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    strokeLinecap="butt"
                    fill="transparent"
                    opacity={isSelected ? 1 : 0.8}
                  />
                );
              })}
            </G>
          </Svg>

          {/* Center Callout */}
          <View style={styles.centerCallout} pointerEvents="none">
            <Text
              style={[styles.centerPercent, { color: active.color || theme.colors.primary }]}
              numberOfLines={1}
            >
              %{active.percentage}
            </Text>
            <Text
              style={[styles.centerLabel, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              Payı
            </Text>
          </View>
        </View>

        {/* Categories Legend List */}
        <View style={styles.legendList}>
          {data.map((cat, idx) => {
            const isSelected = active.name === cat.name;
            return (
              <TouchableOpacity
                key={`cat-legend-${idx}`}
                style={[
                  styles.legendRow,
                  isSelected && [
                    styles.legendRowActive,
                    { backgroundColor: theme.colors.surfaceCard, borderColor: cat.color },
                  ],
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedCategory(cat);
                }}
              >
                <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                <View style={styles.legendTextWrap}>
                  <Text
                    style={[
                      styles.catName,
                      {
                        color: isSelected ? theme.colors.text : theme.colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                  <Text style={[styles.catAmount, { color: theme.colors.textMuted }]}>
                    {formatCurrency(cat.amount)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.percentPill,
                    { backgroundColor: isSelected ? cat.color : theme.colors.borderSubtle },
                  ]}
                >
                  <Text
                    style={[
                      styles.percentText,
                      { color: isSelected ? '#ffffff' : theme.colors.textMuted },
                    ]}
                  >
                    %{cat.percentage}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statTotal: {
    fontSize: 12,
    fontWeight: '700',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  chartWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCallout: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPercent: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: -2,
  },
  legendList: {
    flex: 1,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  legendRowActive: {
    borderWidth: 1,
  },
  colorDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  legendTextWrap: {
    flex: 1,
    marginRight: 6,
  },
  catName: {
    fontSize: 12,
  },
  catAmount: {
    fontSize: 10,
    marginTop: 1,
  },
  percentPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  percentText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyBox: {
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
