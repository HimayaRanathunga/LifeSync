import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchHabitLogsPage } from '../../services/logsService';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useEntranceAnimation } from '../../hooks/useEntranceAnimation';
import Button from '../../components/Button';
import GlassCard from '../../components/GlassCard';
import DateStrip from '../../components/DateStrip';
import PillListRow from '../../components/PillListRow';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import type { HabitLog } from '../../types';
import { toDateKey } from '../../utils/dates';

function last7Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(toDateKey(d));
  }
  return dates;
}

export default function HabitHistoryScreen({ route }: any) {
  const { habitId, habitTitle } = route.params as { habitId: string; habitTitle: string };
  const { user } = useAuth();
  const { colors, radius, spacing, typography } = useTheme();

  const history = usePaginatedList<HabitLog>(user?.uid, (pageSize, cursor) =>
    fetchHabitLogsPage(user!.uid, pageSize, cursor, habitId)
  );

  const dateWindow = useMemo(last7Days, []);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [dateSearchResult, setDateSearchResult] = useState<'found' | 'exhausted' | 'capped' | null>(null);

  const handleSelectDate = async (date: string | null) => {
    setSelectedDate(date);
    setDateSearchResult(null);
    if (!date) return;
    setSearching(true);
    const result = await history.loadUntil((item) => item.date === date);
    setDateSearchResult(result);
    setSearching(false);
  };

  const visibleItems = selectedDate ? history.items.filter((item) => item.date === selectedDate) : history.items;

  const headerAnim = useEntranceAnimation(0, 0);
  const stripAnim = useEntranceAnimation(1, 0);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.surface },
        container: { padding: spacing.lg, paddingBottom: spacing.lg + TAB_BAR_CLEARANCE, gap: spacing.sm },
        headerInner: { padding: spacing.lg, gap: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
        subtitle: { fontSize: 13, color: colors.textSecondary },
        stripWrap: { marginTop: spacing.sm, marginBottom: spacing.xs },
        emptyBox: {
          backgroundColor: colors.background,
          padding: spacing.xl,
          borderRadius: radius.xl,
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: colors.border,
          marginTop: spacing.md,
        },
        empty: { color: colors.textSecondary, textAlign: 'center', fontSize: 13 },
        row: { marginBottom: spacing.sm },
        timeTag: {
          backgroundColor: colors.primarySurface,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: 3,
          borderRadius: radius.pill,
        },
        timeTagText: { fontSize: 11, fontWeight: '700', color: colors.primaryText },
        loadMore: { marginTop: spacing.sm },
      }),
    [colors, radius, spacing, typography]
  );

  const emptyMessage = !selectedDate
    ? 'No completions logged yet for this habit.'
    : dateSearchResult === 'capped'
      ? 'Older entries not loaded for this date — try Load More below, then reselect the date.'
      : 'No entries on this date.';

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.container}
      data={visibleItems}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <Animated.View style={headerAnim}>
            <GlassCard variant="card">
              <View style={styles.headerInner}>
                <Text style={styles.headerTitle}>{habitTitle}</Text>
                <Text style={styles.subtitle}>Historical completion logs and time compliance records.</Text>
              </View>
            </GlassCard>
          </Animated.View>
          <Animated.View style={[styles.stripWrap, stripAnim]}>
            <DateStrip dates={dateWindow} selectedDate={selectedDate} onSelectDate={handleSelectDate} loading={searching} />
          </Animated.View>
        </View>
      }
      ListEmptyComponent={
        !history.loading && !searching ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.empty}>{emptyMessage}</Text>
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <PillListRow
          style={styles.row}
          icon={item.success ? 'checkmark' : 'close'}
          iconColor={item.success ? colors.successText : colors.dangerText}
          iconBackgroundColor={item.success ? colors.successSurface : colors.dangerSurface}
          title={item.date}
          subtitle={item.success ? `Completed ${item.completedAt ? 'at ' + item.completedAt : ''}` : 'Missed day'}
          trailing={
            item.completedAt ? (
              <View style={styles.timeTag}>
                <Text style={styles.timeTagText}>{item.completedAt}</Text>
              </View>
            ) : null
          }
        />
      )}
      ListFooterComponent={
        !selectedDate && history.hasMore ? (
          <Button
            label={history.loading ? 'Loading...' : 'Load more history'}
            variant="secondary"
            onPress={history.loadMore}
            disabled={history.loading}
            style={styles.loadMore}
          />
        ) : null
      }
    />
  );
}
