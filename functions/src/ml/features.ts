/**
 * Shared feature engineering for the habit-success ML model. Used identically by the
 * offline training script (train.ts) and the live Cloud Function (mlRecommender.ts) so
 * training and inference never drift apart.
 */

export interface RawFeatures {
  hour: number; // 0-23, candidate slot hour
  isWeekend: boolean;
  historicalSuccessRate: number; // 0-1, recency-weighted rate for this hour bucket (0.5 if unknown)
  sleepHours: number; // recent average sleep hours (7 if unknown)
  streakLength: number; // current consecutive-day completion streak
  habitAgeDays: number; // days since the habit was created
}

export const FEATURE_NAMES = [
  'sinHour',
  'cosHour',
  'isWeekend',
  'historicalSuccessRate',
  'sleepHoursNorm',
  'streakNorm',
  'habitAgeNorm',
] as const;

/** Converts raw, human-meaningful inputs into the numeric vector the model consumes. */
export function toFeatureVector(raw: RawFeatures): number[] {
  return [
    Math.sin((2 * Math.PI * raw.hour) / 24),
    Math.cos((2 * Math.PI * raw.hour) / 24),
    raw.isWeekend ? 1 : 0,
    raw.historicalSuccessRate,
    Math.min(raw.sleepHours, 10) / 10,
    Math.min(raw.streakLength, 14) / 14,
    Math.min(raw.habitAgeDays, 60) / 60,
  ];
}
