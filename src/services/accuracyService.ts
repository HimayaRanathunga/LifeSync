import type { FoodLog, HabitLog, Recommendation } from '../types';

/**
 * "Accuracy" for food predictions = how closely Gemini's per-item calorie estimate matched the
 * calorie calibration model's cross-check (see functions/src/food/analyzeFoodPhoto.ts's
 * calibrateFoodAnalysis, which stamps `calibrationAvgDiffPct` on logs it was able to cross-check).
 * Logs with no calibration match (calibrationAvgDiffPct absent) are excluded rather than counted
 * as 0% divergence — no data point is not the same as a perfect match.
 */
export function computeFoodPredictionAccuracy(foodLogs: FoodLog[]): {
  accuracyPct: number | null;
  sampleCount: number;
} {
  const withDiff = foodLogs.filter((log) => typeof log.calibrationAvgDiffPct === 'number');
  if (withDiff.length === 0) return { accuracyPct: null, sampleCount: 0 };

  const avgDiffPct =
    withDiff.reduce((sum, log) => sum + (log.calibrationAvgDiffPct as number), 0) / withDiff.length;
  return { accuracyPct: Math.max(0, Math.round(100 - avgDiffPct)), sampleCount: withDiff.length };
}

/**
 * "Accuracy" for habit predictions = how close each habit's most recent recommendation `score`
 * (the ML/rule-based engine's predicted success probability, see functions/src/index.ts's
 * recomputeRecommendationsForUser) was to that habit's actual observed success rate over its
 * logged history. Habits with no recommendation or no logs are excluded (nothing to compare).
 */
export function computeHabitPredictionAccuracy(
  recommendations: Recommendation[],
  habitLogs: HabitLog[]
): { accuracyPct: number | null; habitCount: number } {
  if (recommendations.length === 0) return { accuracyPct: null, habitCount: 0 };

  const logsByHabit = new Map<string, HabitLog[]>();
  for (const log of habitLogs) {
    const arr = logsByHabit.get(log.habitId) ?? [];
    arr.push(log);
    logsByHabit.set(log.habitId, arr);
  }

  let totalAbsError = 0;
  let comparedCount = 0;
  for (const rec of recommendations) {
    const logs = logsByHabit.get(rec.habitId);
    if (!logs || logs.length === 0) continue;
    const actualSuccessRate = logs.filter((l) => l.success).length / logs.length;
    totalAbsError += Math.abs(rec.score - actualSuccessRate);
    comparedCount += 1;
  }

  if (comparedCount === 0) return { accuracyPct: null, habitCount: 0 };
  const avgAbsError = totalAbsError / comparedCount;
  return { accuracyPct: Math.max(0, Math.round((1 - avgAbsError) * 100)), habitCount: comparedCount };
}
