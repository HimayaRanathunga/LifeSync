import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { recommendSlot, type HabitInput, type HabitLogEntry } from './recommendationEngine';
import { recommendHourWithModel, CANDIDATE_HOURS, type MlContext } from './ml/mlRecommender';
import { hourKernelSuccessRate, RECENCY_DECAY, type HourlyAttempt } from './ml/historicalRate';

export { analyzeFoodPhoto } from './food/analyzeFoodPhoto';

initializeApp();
const db = getFirestore();

const LOG_WINDOW_DAYS = 30;
const HEALTH_WINDOW_DAYS = 14;
const MIN_SAMPLES_FOR_ML = 5;

interface HabitDoc extends HabitInput {
  createdAt?: Timestamp;
}

interface HealthLogDoc {
  date: string;
  sleepHours: number;
}

function daysAgo(dateStr: string, today: Date): number {
  const diffMs = today.getTime() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Kernel-weighted success rate for every candidate hour (not just hours the user has
 * literally logged at before) — see historicalRate.ts for why exact-hour bucketing was
 * dropped in favour of this.
 */
function computeHourlySuccessRates(logs: HabitLogEntry[], preferredTime: string, now: Date): Map<number, number> {
  const history: HourlyAttempt[] = logs.map((log) => ({
    hour: Number((log.completedAt ?? preferredTime).split(':')[0]),
    daysAgo: daysAgo(log.date, now),
    success: log.success,
  }));
  const rates = new Map<number, number>();
  for (const hour of CANDIDATE_HOURS) {
    rates.set(hour, hourKernelSuccessRate(history, hour, RECENCY_DECAY));
  }
  return rates;
}

/**
 * Consecutive calendar days ending today with at least one success. Today gets a one-day
 * "grace" — if it has no log yet (the day isn't over), that alone doesn't break a streak
 * that's still active as of yesterday.
 */
function computeStreak(logs: HabitLogEntry[], now: Date): number {
  const successDates = new Set(logs.filter((l) => l.success).map((l) => l.date));
  let streak = 0;
  const cursor = new Date(now);
  let isFirstDay = true;

  while (daysAgo(cursor.toISOString().slice(0, 10), now) <= LOG_WINDOW_DAYS) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (successDates.has(dateStr)) {
      streak += 1;
    } else if (!isFirstDay) {
      break;
    }
    isFirstDay = false;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function recomputeRecommendationsForUser(uid: string): Promise<number> {
  const habitsSnap = await db.collection('users').doc(uid).collection('habits').get();
  if (habitsSnap.empty) return 0;

  const now = new Date();

  const logCutoff = new Date(now);
  logCutoff.setDate(logCutoff.getDate() - LOG_WINDOW_DAYS);
  const logsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('logs')
    .where('date', '>=', logCutoff.toISOString().slice(0, 10))
    .get();

  const logsByHabit = new Map<string, HabitLogEntry[]>();
  for (const doc of logsSnap.docs) {
    const data = doc.data() as { habitId: string; date: string; completedAt: string | null; success: boolean };
    const list = logsByHabit.get(data.habitId) ?? [];
    list.push({ date: data.date, completedAt: data.completedAt, success: data.success });
    logsByHabit.set(data.habitId, list);
  }

  const healthCutoff = new Date(now);
  healthCutoff.setDate(healthCutoff.getDate() - HEALTH_WINDOW_DAYS);
  const healthSnap = await db
    .collection('users')
    .doc(uid)
    .collection('healthLogs')
    .where('date', '>=', healthCutoff.toISOString().slice(0, 10))
    .get();
  const sleepSamples = healthSnap.docs.map((d) => (d.data() as HealthLogDoc).sleepHours).filter((h) => h > 0);
  const avgSleepHours = sleepSamples.length > 0 ? sleepSamples.reduce((a, b) => a + b, 0) / sleepSamples.length : 7;

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const batch = db.batch();
  let count = 0;

  for (const habitDoc of habitsSnap.docs) {
    const data = habitDoc.data() as HabitDoc;
    const habit: HabitInput = { id: habitDoc.id, preferredTime: data.preferredTime };
    const logs = logsByHabit.get(habit.id) ?? [];

    let recommendation;
    if (logs.length < MIN_SAMPLES_FOR_ML) {
      // Cold start: not enough data for the trained model to be trustworthy yet — fall back
      // to the transparent rule-based heuristic (see recommendationEngine.ts).
      recommendation = recommendSlot(habit, logs, now);
    } else {
      const habitAgeDays = data.createdAt ? daysAgo(data.createdAt.toDate().toISOString().slice(0, 10), now) : 0;
      const context: MlContext = {
        isWeekend,
        hourlySuccessRates: computeHourlySuccessRates(logs, habit.preferredTime, now),
        sleepHours: avgSleepHours,
        streakLength: computeStreak(logs, now),
        habitAgeDays,
      };
      const { suggestedHour, probability } = recommendHourWithModel(context);
      const percent = Math.round(probability * 100);
      recommendation = {
        habitId: habit.id,
        suggestedTime: `${String(suggestedHour).padStart(2, '0')}:00`,
        score: probability,
        reason: `ML model predicts ${percent}% success around ${String(suggestedHour).padStart(2, '0')}:00, based on your history, sleep, and streak (trained on a synthetic + your own completion data).`,
        generatedAt: now.getTime(),
      };
    }

    const recRef = db.collection('users').doc(uid).collection('recommendations').doc(habit.id);
    batch.set(recRef, recommendation);
    count += 1;
  }

  await batch.commit();
  return count;
}

// Recomputes every user's recommendations once a day — keeps the client thin and the
// heavy lifting server-side.
export const recomputeRecommendationsDaily = onSchedule('every day 03:00', async () => {
  const usersSnap = await db.collection('users').get();
  let total = 0;
  for (const userDoc of usersSnap.docs) {
    total += await recomputeRecommendationsForUser(userDoc.id);
  }
  logger.info(`Recomputed recommendations for ${usersSnap.size} users, ${total} habits total.`);
});

// Callable so the app can force a recompute right after a habit is logged, instead of
// waiting for the next scheduled run — useful for demoing the AI engine live.
export const recomputeMyRecommendations = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const count = await recomputeRecommendationsForUser(uid);
  return { habitsProcessed: count };
});
