import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
}

/** Plain-View bar-style mini chart — no SVG/charting dependency, see MetricCard.tsx's progress bar for the same rationale. */
export default function Sparkline({ values, color, height = 28 }: SparklineProps) {
  const { colors, radius } = useTheme();
  const barColor = color ?? colors.primary;
  const max = Math.max(...values, 1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
        barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
        bar: { width: '100%', borderRadius: radius.sm, minHeight: 2, opacity: 0.85 },
      }),
    [radius]
  );

  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((value, i) => (
        <View key={i} style={styles.barTrack}>
          <View style={[styles.bar, { height: `${Math.max((value / max) * 100, 4)}%`, backgroundColor: barColor }]} />
        </View>
      ))}
    </View>
  );
}
