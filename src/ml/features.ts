/**
 * Feature engineering for the habit-timing model. Imported by both the offline trainer
 * (ml/train.ts) and on-device inference (src/ml/recommender.ts), so training and serving can
 * never drift apart.
 *
 * Two decisions here differ from the earlier server-side model, both driven by measurement:
 *
 * 1. Hour is encoded RELATIVE to the user's declared preferred hour, not as an absolute
 *    clock position. An absolute sinusoid can only learn one population-wide "good time",
 *    which is wrong for every individual whose routine differs — and measurably worse than
 *    simply using the user's own chosen time. Encoding the offset lets the model learn
 *    "how far from your intended time still works", which is a per-user question.
 *
 * 2. The user's waking and working hours are inputs. Onboarding already collects wakeTime,
 *    workStart and workEnd; nothing read them. A candidate hour before the user is awake or
 *    in the middle of their working day is a bad suggestion regardless of what the history
 *    says, and the model can now learn that instead of being blind to it.
 */

export interface RawFeatures {
  /** Candidate slot, 0-23. */
  hour: number;
  /** The hour the user chose for this habit, 0-23. */
  preferredHour: number;
  isWeekend: boolean;
  /** Shrunk, recency-weighted success rate for this hour (see historicalRate.ts). */
  historicalSuccessRate: number;
  /** Total kernel weight behind that rate — lets the model learn how far to trust it. */
  evidence: number;
  /** Consecutive-day completion streak. */
  streakLength: number;
  /** Days since the habit was created. */
  habitAgeDays: number;
  /** Local hour the user wakes, 0-23. */
  wakeHour: number;
  /** Local hours the user is at work. */
  workStartHour: number;
  workEndHour: number;
}

export const FEATURE_NAMES = [
  'hourOffsetSin',
  'hourOffsetCos',
  'isWeekend',
  'historicalSuccessRate',
  'evidenceNorm',
  'streakNorm',
  'habitAgeNorm',
  'isAwake',
  'isDuringWork',
] as const;

/** Signed hour difference wrapped to [-12, 12], so 23:00 vs 01:00 is +2, not -22. */
export function wrapHourDelta(delta: number): number {
  let d = ((delta % 24) + 24) % 24;
  if (d > 12) d -= 24;
  return d;
}

function isHourInWindow(hour: number, start: number, end: number): boolean {
  // Windows that cross midnight (e.g. a night shift 22:00-06:00) need the inverted test.
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function toFeatureVector(raw: RawFeatures): number[] {
  const offset = wrapHourDelta(raw.hour - raw.preferredHour);

  return [
    // Offset encoded on a circle so "3 hours early" and "3 hours late" are distinguishable
    // while the representation stays continuous across the wrap point.
    Math.sin((2 * Math.PI * offset) / 24),
    Math.cos((2 * Math.PI * offset) / 24),
    raw.isWeekend ? 1 : 0,
    raw.historicalSuccessRate,
    // log1p keeps the first few observations informative without letting a long history dominate.
    Math.min(1, Math.log1p(raw.evidence) / Math.log1p(20)),
    Math.min(raw.streakLength, 14) / 14,
    Math.min(raw.habitAgeDays, 60) / 60,
    isHourInWindow(raw.hour, raw.wakeHour, (raw.wakeHour + 17) % 24) ? 1 : 0,
    isHourInWindow(raw.hour, raw.workStartHour, raw.workEndHour) ? 1 : 0,
  ];
}
