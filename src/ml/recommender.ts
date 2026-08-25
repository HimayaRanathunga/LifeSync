import { predictProbability } from './logisticRegression';
import { trainedModel } from './model/weights.generated';
import { toFeatureVector, wrapHourDelta } from './features';
import { hourKernelSuccessRate, type HourlyAttempt } from './historicalRate';
import type { Habit, HabitLog, UserProfile } from '../types';
import { fromDateKey, toDateKey } from '../utils/dates';

/**
 * On-device habit-timing recommender.
 *
 * The model is a few dozen floats compiled into the bundle, so this runs with no network, no
 * Cloud Function and no native dependency — recommendations are available immediately after
 * install and keep working offline. That matters here beyond convenience: the server-side
 * equivalent requires a Firebase Blaze plan and a deploy step, so without this the app's headline
 * AI feature would simply not run.
 */

export const CANDIDATE_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

/**
 * Below this many logged attempts the history feature carries almost no signal, so the model's
 * output is dominated by the prior. Reporting a confidence in that regime would present an
 * absence of evidence as a measurement.
 */
export const MIN_ATTEMPTS_FOR_CONFIDENCE = 3;

export interface LocalRecommendation {
  habitId: string;
  suggestedHour: number;
  suggestedTime: string; // "HH:mm"
  /** Model probability for the suggested hour, or null when there is too little history. */
  confidence: number | null;
  reason: string;
  attempts: number;
}

function parseHour(time: string | undefined, fallback: number): number {
  const h = Number((time ?? '').split(':')[0]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : fallback;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function daysBetween(dateKey: string, today: Date): number {
  const diff = today.getTime() - fromDateKey(dateKey).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

/** Consecutive days ending today with at least one success. Today gets a one-day grace. */
function currentStreak(logs: HabitLog[], today: Date): number {
  const successDates = new Set(logs.filter((l) => l.success).map((l) => l.date));
  const cursor = new Date(today);
  if (!successDates.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (successDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function describe(hour: number, preferredHour: number, attempts: number, rate: number): string {
  const delta = wrapHourDelta(hour - preferredHour);

  if (attempts < MIN_ATTEMPTS_FOR_CONFIDENCE) {
    return delta === 0
      ? 'Using your chosen time — log a few days and this will adapt to when you actually follow through.'
      : `Your schedule suggests ${formatHour(hour)} fits better than ${formatHour(preferredHour)}. Log a few days to confirm.`;
  }
  if (delta === 0) {
    return `${formatHour(hour)} is working for you — ${Math.round(rate * 100)}% of your attempts around this time succeeded.`;
  }
  const direction = delta > 0 ? 'later' : 'earlier';
  return `You complete this more often ${Math.abs(delta)}h ${direction}, around ${formatHour(hour)}.`;
}

export function recommendForHabit(
  habit: Habit,
  logs: HabitLog[],
  profile: UserProfile | null,
  now: Date = new Date()
): LocalRecommendation {
  const habitLogs = logs.filter((l) => l.habitId === habit.id);
  const preferredHour = parseHour(habit.preferredTime, 7);

  const history: HourlyAttempt[] = habitLogs.map((l) => ({
    hour: parseHour(l.completedAt ?? habit.preferredTime, preferredHour),
    daysAgo: daysBetween(l.date, now),
    success: l.success,
  }));

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const streakLength = currentStreak(habitLogs, now);
  const habitAgeDays =
    typeof habit.createdAt === 'number' ? daysBetween(toDateKey(new Date(habit.createdAt)), now) : 0;

  // The schedule the user gave at onboarding. Before this model it was written to Firestore and
  // never read by anything.
  const wakeHour = parseHour(profile?.wakeTime, 7);
  const workStartHour = parseHour(profile?.workStart, 9);
  const workEndHour = parseHour(profile?.workEnd, 17);

  let bestHour = preferredHour;
  let bestProb = -1;
  let bestRate = 0.5;

  for (const hour of CANDIDATE_HOURS) {
    const { rate, evidence } = hourKernelSuccessRate(history, hour);
    const probability = predictProbability(
      trainedModel,
      toFeatureVector({
        hour,
        preferredHour,
        isWeekend,
        historicalSuccessRate: rate,
        evidence,
        streakLength,
        habitAgeDays,
        wakeHour,
        workStartHour,
        workEndHour,
      })
    );
    if (probability > bestProb) {
      bestProb = probability;
      bestHour = hour;
      bestRate = rate;
    }
  }

  const attempts = habitLogs.length;
  return {
    habitId: habit.id,
    suggestedHour: bestHour,
    suggestedTime: formatHour(bestHour),
    confidence: attempts >= MIN_ATTEMPTS_FOR_CONFIDENCE ? bestProb : null,
    reason: describe(bestHour, preferredHour, attempts, bestRate),
    attempts,
  };
}

export function recommendForHabits(
  habits: Habit[],
  logs: HabitLog[],
  profile: UserProfile | null,
  now: Date = new Date()
): LocalRecommendation[] {
  return habits
    .map((h) => recommendForHabit(h, logs, profile, now))
    // Most-confident first; unscored habits (too little history) sort last but are still shown.
    .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
}
