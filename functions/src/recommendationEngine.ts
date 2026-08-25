/**
 * Weighted-scoring habit recommendation engine.
 *
 * Deliberately a transparent, explainable model (not a black-box ML model) — it scores each
 * candidate time slot by a recency-weighted success rate, so every recommendation comes with a
 * human-readable reason. This is the "smart" core of LifeSync: it adapts as new completion data
 * arrives instead of using a fixed schedule.
 */

export interface HabitLogEntry {
  date: string; // "YYYY-MM-DD"
  completedAt: string | null; // "HH:mm" if completed, null if missed
  success: boolean;
}

export interface HabitInput {
  id: string;
  preferredTime: string; // "HH:mm"
}

export interface Recommendation {
  habitId: string;
  suggestedTime: string;
  score: number;
  reason: string;
  generatedAt: number;
}

const SLOT_MINUTES = 30;
const RECENCY_DECAY = 0.92; // each day further in the past counts ~8% less
const MIN_SAMPLES_FOR_CONFIDENCE = 3;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundToSlot(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function daysAgo(dateStr: string, today: Date): number {
  const diffMs = today.getTime() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Scores every slot the habit has actually been attempted in, plus its declared preferred slot,
 * and returns the highest-confidence one. Falls back to the preferred time when there isn't
 * enough history yet.
 */
export function recommendSlot(habit: HabitInput, logs: HabitLogEntry[], now: Date = new Date()): Recommendation {
  const preferredSlot = roundToSlot(toMinutes(habit.preferredTime));

  if (logs.length === 0) {
    return {
      habitId: habit.id,
      suggestedTime: toHHMM(preferredSlot),
      score: 0.5,
      reason: 'Not enough history yet — using your preferred time.',
      generatedAt: now.getTime(),
    };
  }

  const slotWeights = new Map<number, { weightedSuccess: number; weightTotal: number; samples: number }>();

  for (const log of logs) {
    const slotSource = log.completedAt ?? habit.preferredTime;
    const slot = roundToSlot(toMinutes(slotSource));
    const weight = Math.pow(RECENCY_DECAY, daysAgo(log.date, now));

    const bucket = slotWeights.get(slot) ?? { weightedSuccess: 0, weightTotal: 0, samples: 0 };
    bucket.weightedSuccess += weight * (log.success ? 1 : 0);
    bucket.weightTotal += weight;
    bucket.samples += 1;
    slotWeights.set(slot, bucket);
  }

  // Always keep the preferred slot as a candidate, even with zero logs in it.
  if (!slotWeights.has(preferredSlot)) {
    slotWeights.set(preferredSlot, { weightedSuccess: 0, weightTotal: 0, samples: 0 });
  }

  let best = { slot: preferredSlot, score: 0.5, samples: 0 };
  for (const [slot, bucket] of slotWeights) {
    const score = bucket.weightTotal > 0 ? bucket.weightedSuccess / bucket.weightTotal : 0.5;
    const isBetter =
      bucket.samples >= MIN_SAMPLES_FOR_CONFIDENCE && score > best.score
        ? true
        : best.samples < MIN_SAMPLES_FOR_CONFIDENCE && bucket.samples > best.samples;
    if (isBetter) best = { slot, score, samples: bucket.samples };
  }

  const percent = Math.round(best.score * 100);
  const shifted = best.slot !== preferredSlot;
  const reason =
    best.samples < MIN_SAMPLES_FOR_CONFIDENCE
      ? `Still learning your pattern (${best.samples} data point${best.samples === 1 ? '' : 's'} so far) — using your preferred time.`
      : shifted
        ? `You succeed ${percent}% of the time around ${toHHMM(best.slot)}, higher than your original ${habit.preferredTime} slot — suggesting a shift.`
        : `You succeed ${percent}% of the time around ${toHHMM(best.slot)} — this remains your best slot.`;

  return {
    habitId: habit.id,
    suggestedTime: toHHMM(best.slot),
    score: best.score,
    reason,
    generatedAt: now.getTime(),
  };
}
