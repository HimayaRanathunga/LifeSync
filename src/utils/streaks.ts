import type { Habit, HabitLog } from '../types';

export interface Streak {
  habitId: string;
  habitTitle: string;
  days: number;
}

/**
 * Current streak length from a set of "successfully completed" date strings ("YYYY-MM-DD").
 * Walks backward day-by-day from today, stopping at the first missed day. If today isn't logged
 * yet, doesn't treat the streak as already broken — there's still time today to keep it alive —
 * so counting starts from yesterday instead (same convention most streak-tracking apps use).
 */
function currentStreakFromDates(dates: Set<string>): number {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let days = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

function successDatesByHabit(logs: HabitLog[]): Map<string, Set<string>> {
  const byHabit = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.success) continue;
    if (!byHabit.has(log.habitId)) byHabit.set(log.habitId, new Set());
    byHabit.get(log.habitId)!.add(log.date);
  }
  return byHabit;
}

/**
 * Current streak per habit, from a bounded recent-logs window (see logsService.ts's
 * fetchRecentHabitLogs). Simplification: treats every calendar day as "scheduled" rather than
 * respecting each habit's daysOfWeek — a habit only scheduled 3x/week will show gaps here even
 * when it hasn't actually been missed. Good enough for a motivational badge, not used for
 * anything the recommendation engine depends on.
 */
export function computeStreaksByHabit(logs: HabitLog[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const [habitId, dates] of successDatesByHabit(logs)) {
    const days = currentStreakFromDates(dates);
    if (days > 0) result.set(habitId, days);
  }
  return result;
}

/** Longest current streak across all habits — see computeStreaksByHabit for the per-habit logic. */
export function computeBestStreak(logs: HabitLog[], habits: Habit[]): Streak | null {
  const titleById = new Map(habits.map((h) => [h.id, h.title]));
  let best: Streak | null = null;

  for (const [habitId, days] of computeStreaksByHabit(logs)) {
    if (!best || days > best.days) {
      best = { habitId, habitTitle: titleById.get(habitId) ?? 'Habit', days };
    }
  }

  return best;
}
