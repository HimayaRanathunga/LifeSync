import React, { useMemo } from 'react';
import { ScrollView, Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import GlassCard from './GlassCard';

interface DateStripProps {
  /** ISO 'yyyy-mm-dd' dates, typically a 7-day rolling window ending today. */
  dates: string[];
  /** null = no date filter applied ("show everything"). */
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  loading?: boolean;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function DateStrip({ dates, selectedDate, onSelectDate, loading }: DateStripProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
        pillOuter: { width: 48, height: 60 },
        pillInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
        pillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
        dayLetter: { ...typography.caption, color: colors.textSecondary },
        dayLetterSelected: { color: colors.textOnPrimary, opacity: 0.85 },
        dayNumber: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
        dayNumberSelected: { color: colors.textOnPrimary },
        loadingWrap: { paddingHorizontal: spacing.sm, justifyContent: 'center' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {dates.map((date) => {
        const isSelected = date === selectedDate;
        const d = new Date(date + 'T00:00:00');
        const letter = DAY_LETTERS[d.getDay()];
        const num = d.getDate();

        return (
          <Pressable
            key={date}
            onPress={() => onSelectDate(isSelected ? null : date)}
            accessibilityRole="button"
            accessibilityLabel={date}
            accessibilityState={{ selected: isSelected }}
            style={styles.pillOuter}
          >
            {isSelected ? (
              <View style={[styles.pillInner, styles.pillSelected, { borderRadius: radius.pill, borderWidth: 1 }]}>
                <Text style={[styles.dayLetter, styles.dayLetterSelected]}>{letter}</Text>
                <Text style={[styles.dayNumber, styles.dayNumberSelected]}>{num}</Text>
              </View>
            ) : (
              <GlassCard variant="pill" style={{ flex: 1 }}>
                <View style={styles.pillInner}>
                  <Text style={styles.dayLetter}>{letter}</Text>
                  <Text style={styles.dayNumber}>{num}</Text>
                </View>
              </GlassCard>
            )}
          </Pressable>
        );
      })}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </ScrollView>
  );
}
