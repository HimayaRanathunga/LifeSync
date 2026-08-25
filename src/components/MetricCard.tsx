import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import Sparkline from './Sparkline';
import CircularProgress from './CircularProgress';
import { useTheme } from '../context/ThemeContext';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  variant?: 'surface' | 'tint' | 'success' | 'elevated';
  accessibilityLabel?: string;
  /** 0-1 fraction of a daily goal, rendered as a thin progress bar (or a ring, see progressStyle). Omit to hide. */
  progress?: number;
  /** 'bar' (default, unchanged) or 'ring' — renders CircularProgress with the value/unit centered inside instead. */
  progressStyle?: 'bar' | 'ring';
  /** Ring diameter, only read when progressStyle === 'ring'. */
  ringSize?: number;
  /** Last N days of values (oldest first), rendered as a small bar-style sparkline. */
  trend?: number[];
  children?: React.ReactNode;
}

export default function MetricCard({
  label,
  value,
  unit,
  variant = 'elevated',
  accessibilityLabel,
  progress,
  progressStyle = 'bar',
  ringSize = 72,
  trend,
  children,
}: MetricCardProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const clampedProgress = progress === undefined ? undefined : Math.min(Math.max(progress, 0), 1);
  const isRing = progressStyle === 'ring' && clampedProgress !== undefined;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { flex: 1 },
        label: { ...typography.label, color: colors.textSecondary },
        valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs, gap: spacing.xs },
        value: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
        ringValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
        unit: { fontSize: typography.caption.fontSize, color: colors.textSecondary },
        progressTrack: {
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          marginTop: spacing.sm,
          overflow: 'hidden',
        },
        progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
        ringRow: { alignItems: 'center', marginTop: spacing.xs },
        trend: { marginTop: spacing.sm },
        children: { marginTop: spacing.sm },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <Card variant={variant} style={styles.card} accessibilityLabel={accessibilityLabel ?? `${label}: ${value}${unit ?? ''}`}>
      <Text style={styles.label}>{label}</Text>

      {isRing ? (
        <View style={styles.ringRow}>
          <CircularProgress value={clampedProgress!} max={1} size={ringSize} trackColor={colors.surface}>
            <Text style={styles.ringValue}>{value}</Text>
            {unit ? <Text style={styles.unit}>{unit}</Text> : null}
          </CircularProgress>
        </View>
      ) : (
        <>
          <View style={styles.valueRow}>
            <Text style={styles.value}>{value}</Text>
            {unit ? <Text style={styles.unit}>{unit}</Text> : null}
          </View>
          {clampedProgress !== undefined ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${clampedProgress * 100}%` }]} />
            </View>
          ) : null}
        </>
      )}

      {trend && trend.length > 0 ? (
        <View style={styles.trend}>
          <Sparkline values={trend} />
        </View>
      ) : null}

      {children ? <View style={styles.children}>{children}</View> : null}
    </Card>
  );
}
