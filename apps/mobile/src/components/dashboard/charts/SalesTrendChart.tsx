import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, TouchableOpacity } from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Text as SvgText,
  Line,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { SalesTrendPoint } from '../../../services/dashboard.service';
import { formatCurrency } from '../../../lib/utils';

export interface SalesTrendChartProps {
  data: SalesTrendPoint[];
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data }) => {
  const { theme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(330);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    data.length > 0 ? data.length - 1 : null
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
          Son 7 güne ait satış verisi bulunamadı.
        </Text>
      </View>
    );
  }

  const height = 150;
  const padLeft = 24;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 28;

  const chartWidth = Math.max(200, containerWidth);
  const usableWidth = chartWidth - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;

  const amounts = data.map((d) => d.amount);
  const maxAmount = Math.max(...amounts, 1000);
  const minAmount = 0;
  const range = maxAmount - minAmount || 1;

  // Calculate coordinates for each point
  const points = data.map((item, idx) => {
    const x = padLeft + (idx / Math.max(1, data.length - 1)) * usableWidth;
    const y = padTop + usableHeight - ((item.amount - minAmount) / range) * usableHeight;
    return { x, y, item, idx };
  });

  // Build smooth bezier curve
  let curvePath = '';
  if (points.length > 0) {
    curvePath = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      curvePath += ` C ${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
    }
  }

  // Build closed area for gradient fill
  const lastP = points[points.length - 1];
  const firstP = points[0];
  const baselineY = height - padBottom;
  const areaPath = `${curvePath} L ${lastP.x},${baselineY} L ${firstP.x},${baselineY} Z`;

  // Compute total and peak
  const total7Days = amounts.reduce((a, b) => a + b, 0);
  const peakIndex = amounts.indexOf(Math.max(...amounts));
  const activePoint =
    selectedPointIndex !== null && points[selectedPointIndex]
      ? points[selectedPointIndex]
      : points[points.length - 1];

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {/* KPI Highlight Header */}
      <View style={styles.summaryRow}>
        <View>
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            {activePoint ? `${activePoint.item.dayLabel}, ${activePoint.item.date}` : 'Son 7 Gün'}
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {formatCurrency(activePoint ? activePoint.item.amount : total7Days)}
          </Text>
        </View>

        <View style={styles.badgeWrap}>
          <View style={[styles.peakBadge, { backgroundColor: theme.colors.primaryMuted }]}>
            <Text style={[styles.peakBadgeText, { color: theme.colors.primary }]}>
              {activePoint?.item.count ?? 0} Fatura
            </Text>
          </View>
        </View>
      </View>

      {/* SVG Canvas */}
      <View style={styles.svgContainer}>
        <Svg width={chartWidth} height={height}>
          <Defs>
            <LinearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity="0.45" />
              <Stop offset="90%" stopColor={theme.colors.primary} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Horizontal gridlines */}
          <Line
            x1={padLeft}
            y1={padTop}
            x2={chartWidth - padRight}
            y2={padTop}
            stroke={theme.colors.borderSubtle}
            strokeDasharray="4,4"
            strokeWidth="1"
          />
          <Line
            x1={padLeft}
            y1={baselineY}
            x2={chartWidth - padRight}
            y2={baselineY}
            stroke={theme.colors.borderSubtle}
            strokeWidth="1"
          />

          {/* Area gradient fill */}
          {areaPath ? <Path d={areaPath} fill="url(#salesGrad)" /> : null}

          {/* Line curve */}
          {curvePath ? (
            <Path
              d={curvePath}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : null}

          {/* Points & Day labels */}
          {points.map((pt) => {
            const isSelected = selectedPointIndex === pt.idx;
            const isPeak = pt.idx === peakIndex && pt.item.amount > 0;

            return (
              <React.Fragment key={pt.idx}>
                {/* Active indicator ring */}
                {isSelected && (
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r="10"
                    fill={theme.colors.primary + '30'}
                  />
                )}

                {/* Point dot */}
                <Circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? '5.5' : isPeak ? '4.5' : '3.5'}
                  fill={isSelected ? '#ffffff' : isPeak ? theme.colors.primary : theme.colors.primary}
                  stroke={theme.colors.primary}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedPointIndex(pt.idx);
                  }}
                />

                {/* X-axis day label */}
                <SvgText
                  x={pt.x}
                  y={height - 6}
                  fontSize="10"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  fill={isSelected ? theme.colors.primary : theme.colors.textMuted}
                  textAnchor="middle"
                >
                  {pt.item.dayLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  peakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  peakBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  svgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 12,
  },
});
