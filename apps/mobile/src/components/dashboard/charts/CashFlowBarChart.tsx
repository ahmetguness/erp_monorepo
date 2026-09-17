import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { CashFlowTrendPoint } from '../../../services/dashboard.service';
import { formatCurrency } from '../../../lib/utils';

export interface CashFlowBarChartProps {
  data: CashFlowTrendPoint[];
}

export const CashFlowBarChart: React.FC<CashFlowBarChartProps> = ({ data }) => {
  const { theme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(330);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    data && data.length > 0 ? data.length - 1 : null
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
          Son 7 güne ait nakit akış verisi bulunamadı.
        </Text>
      </View>
    );
  }

  const height = 150;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 26;

  const chartWidth = Math.max(200, containerWidth);
  const usableWidth = chartWidth - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;

  // Max value calculation for scaling
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.inflow, d.outflow)),
    500
  );

  const totalInflow = data.reduce((acc, d) => acc + d.inflow, 0);
  const totalOutflow = data.reduce((acc, d) => acc + d.outflow, 0);
  const totalNet = totalInflow - totalOutflow;

  const numGroups = data.length;
  const groupWidth = usableWidth / Math.max(1, numGroups);
  const barWidth = Math.max(6, Math.min(14, (groupWidth - 12) / 2));

  const activePoint =
    selectedIndex !== null && data[selectedIndex] ? data[selectedIndex] : data[data.length - 1];

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {/* Summary KPI Header */}
      <View style={styles.summaryRow}>
        <View>
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            {activePoint ? `${activePoint.dayLabel}, ${activePoint.date}` : 'Haftalık Nakit Akışı'}
          </Text>
          <View style={styles.netRow}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {activePoint
                ? `Giriş: ${formatCurrency(activePoint.inflow)}`
                : `Toplam: ${formatCurrency(totalInflow)}`}
            </Text>
            {activePoint && (
              <Text
                style={[
                  styles.statSubValue,
                  {
                    color:
                      activePoint.net >= 0 ? theme.colors.success : theme.colors.danger,
                  },
                ]}
              >
                {activePoint.net >= 0 ? '+' : ''}
                {formatCurrency(activePoint.net)} net
              </Text>
            )}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legendWrap}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>Giriş</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>Çıkış</Text>
          </View>
        </View>
      </View>

      {/* Svg Dual Bar Chart */}
      <Svg width={chartWidth} height={height} style={styles.svg}>
        {/* Baseline */}
        <Line
          x1={padLeft}
          y1={height - padBottom}
          x2={chartWidth - padRight}
          y2={height - padBottom}
          stroke={theme.colors.borderSubtle}
          strokeWidth={1}
        />

        {/* Dashed Mid-Guide */}
        <Line
          x1={padLeft}
          y1={padTop + usableHeight / 2}
          x2={chartWidth - padRight}
          y2={padTop + usableHeight / 2}
          stroke={theme.colors.borderSubtle}
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {data.map((item, idx) => {
          const groupCenterX = padLeft + idx * groupWidth + groupWidth / 2;
          const isSelected = selectedIndex === idx;

          const inflowHeight = Math.max(3, (item.inflow / maxVal) * usableHeight);
          const outflowHeight = Math.max(3, (item.outflow / maxVal) * usableHeight);

          const inflowX = groupCenterX - barWidth - 1;
          const inflowY = height - padBottom - inflowHeight;

          const outflowX = groupCenterX + 1;
          const outflowY = height - padBottom - outflowHeight;

          return (
            <React.Fragment key={`group-${idx}`}>
              {/* Highlight background column on selection */}
              {isSelected && (
                <Rect
                  x={groupCenterX - groupWidth / 2 + 2}
                  y={padTop}
                  width={groupWidth - 4}
                  height={usableHeight + 4}
                  fill={theme.colors.primaryMuted}
                  opacity={0.35}
                  rx={4}
                />
              )}

              {/* Inflow Bar (Green) */}
              <Rect
                x={inflowX}
                y={inflowY}
                width={barWidth}
                height={inflowHeight}
                fill="#10b981"
                rx={barWidth / 2}
                opacity={isSelected ? 1 : 0.85}
              />

              {/* Outflow Bar (Red) */}
              <Rect
                x={outflowX}
                y={outflowY}
                width={barWidth}
                height={outflowHeight}
                fill="#ef4444"
                rx={barWidth / 2}
                opacity={isSelected ? 1 : 0.85}
              />

              {/* Day Label */}
              <SvgText
                x={groupCenterX}
                y={height - 8}
                fontSize={10}
                fontWeight={isSelected ? '700' : '500'}
                fill={isSelected ? theme.colors.text : theme.colors.textMuted}
                textAnchor="middle"
              >
                {item.dayLabel}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Floating Breakdown Popover Tooltip for Active Bar Group */}
        {selectedIndex !== null && data[selectedIndex] && (() => {
          const item = data[selectedIndex];
          const groupLeft = padLeft + selectedIndex * groupWidth;
          const groupCenterX = groupLeft + groupWidth / 2;
          const tipW = 108;
          const tipX = Math.max(padLeft, Math.min(chartWidth - padRight - tipW, groupCenterX - tipW / 2));
          return (
            <G x={tipX} y={2}>
              <Rect
                width={tipW}
                height="32"
                rx="6"
                fill="rgba(19, 25, 38, 0.95)"
                stroke={theme.colors.border}
                strokeWidth="1"
              />
              <SvgText
                x={tipW / 2}
                y="13"
                fontSize="8.5"
                fontWeight="700"
                fill="#10B981"
                textAnchor="middle"
              >
                +{formatCurrency(item.inflow)} Giriş
              </SvgText>
              <SvgText
                x={tipW / 2}
                y="26"
                fontSize="8.5"
                fontWeight="700"
                fill="#EF4444"
                textAnchor="middle"
              >
                -{formatCurrency(item.outflow)} Çıkış
              </SvgText>
            </G>
          );
        })()}
      </Svg>

      {/* Interactive touch targets */}
      <View style={[styles.touchOverlay, { left: padLeft, width: usableWidth, height }]}>
        {data.map((_, idx) => (
          <TouchableOpacity
            key={`touch-${idx}`}
            style={{ flex: 1 }}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSelectedIndex(idx);
            }}
          />
        ))}
      </View>

      {/* Footer net metric summary */}
      <View style={[styles.footerRow, { borderTopColor: theme.colors.borderSubtle }]}>
        <Text style={[styles.footerSub, { color: theme.colors.textMuted }]}>
          7 Günlük Net Nakit Akışı:
        </Text>
        <Text
          style={[
            styles.footerNet,
            { color: totalNet >= 0 ? theme.colors.success : theme.colors.danger },
          ]}
        >
          {totalNet >= 0 ? '+' : ''}
          {formatCurrency(totalNet)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    position: 'relative',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statSubValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  legendWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  svg: {
    alignSelf: 'center',
  },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1,
    paddingHorizontal: 4,
  },
  footerSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerNet: {
    fontSize: 13,
    fontWeight: '800',
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
