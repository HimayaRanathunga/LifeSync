/**
 * Synthetic training data generator for habit success prediction.
 *
 * Simulates a realistic population with diverse behavioral archetypes
 * (morning achievers, lunchtime habiters, evening unwinders, weekend shifters,
 * and sporadic users) to solve the cold-start problem and teach the ML model
 * meaningful circadian, sleep, streak, and historical adherence patterns.
 */

import { toFeatureVector, type RawFeatures } from './features';
import { hourKernelSuccessRate, RECENCY_DECAY, type HourlyAttempt } from './historicalRate';

export interface TrainingSample {
  raw: RawFeatures;
  label: number; // 1 = success, 0 = fail
}

function gaussianKernel(distance: number, sigma: number): number {
  return Math.exp(-(distance ** 2) / (2 * sigma ** 2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomNormal(mean: number, stdDev: number): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

export type UserArchetype = 'early_bird' | 'midday' | 'evening' | 'night_owl' | 'weekend_warrior' | 'inconsistent';

export function generateSyntheticDataset(userCount = 500, daysPerUser = 40): TrainingSample[] {
  const samples: TrainingSample[] = [];
  const archetypes: UserArchetype[] = ['early_bird', 'midday', 'evening', 'night_owl', 'weekend_warrior', 'inconsistent'];

  for (let u = 0; u < userCount; u++) {
    const archetype = archetypes[u % archetypes.length];

    let basePreferredHour: number;
    let preferredHourSigma = 2.0;
    let baselineSuccess = 0.20;
    let peakBoost = 0.60;
    let sleepSensitivity = 0.04;
    let weekendShift = 0;
    let consistency = 0.85;

    switch (archetype) {
      case 'early_bird':
        basePreferredHour = randomBetween(6, 8.5);
        sleepSensitivity = randomBetween(0.04, 0.08);
        baselineSuccess = 0.25;
        peakBoost = 0.65;
        weekendShift = randomBetween(0.5, 1.5);
        consistency = 0.88;
        break;
      case 'midday':
        basePreferredHour = randomBetween(12, 14);
        sleepSensitivity = randomBetween(0.02, 0.05);
        baselineSuccess = 0.20;
        peakBoost = 0.60;
        weekendShift = randomBetween(-2, 2);
        consistency = 0.80;
        break;
      case 'evening':
        basePreferredHour = randomBetween(18, 20.5);
        sleepSensitivity = randomBetween(0.03, 0.06);
        baselineSuccess = 0.22;
        peakBoost = 0.62;
        weekendShift = randomBetween(1, 3);
        consistency = 0.82;
        break;
      case 'night_owl':
        basePreferredHour = randomBetween(21, 23.5);
        sleepSensitivity = randomBetween(0.01, 0.04);
        baselineSuccess = 0.18;
        peakBoost = 0.58;
        weekendShift = randomBetween(1.5, 3.5);
        consistency = 0.75;
        break;
      case 'weekend_warrior':
        basePreferredHour = randomBetween(9, 17);
        sleepSensitivity = randomBetween(0.02, 0.05);
        baselineSuccess = 0.15;
        peakBoost = 0.60;
        weekendShift = randomBetween(3, 5);
        consistency = 0.70;
        break;
      case 'inconsistent':
      default:
        basePreferredHour = randomBetween(7, 21);
        preferredHourSigma = 3.5;
        sleepSensitivity = randomBetween(0.02, 0.06);
        baselineSuccess = 0.15;
        peakBoost = 0.45;
        weekendShift = randomBetween(-3, 3);
        consistency = 0.55;
        break;
    }

    let streak = 0;
    const pastAttempts: { hour: number; day: number; success: boolean }[] = [];

    for (let day = 0; day < daysPerUser; day++) {
      const isWeekend = day % 7 === 5 || day % 7 === 6;
      const targetHour = isWeekend ? clamp(basePreferredHour + weekendShift, 6, 23) : basePreferredHour;

      const attemptHour =
        Math.random() > consistency
          ? Math.round(randomBetween(6, 23))
          : clamp(Math.round(targetHour + randomBetween(-1.5, 1.5)), 0, 23);

      const sleepHours = clamp(randomNormal(7.2, 1.3), 3.5, 10.5);

      let probability = baselineSuccess + peakBoost * gaussianKernel(attemptHour - targetHour, preferredHourSigma);

      if (sleepHours < 6.5) {
        probability -= sleepSensitivity * (6.5 - sleepHours) * 1.5;
      } else if (sleepHours >= 7.0 && sleepHours <= 9.0) {
        probability += sleepSensitivity * (sleepHours - 7.0);
      } else if (sleepHours > 9.5) {
        probability -= 0.03;
      }

      const effectiveStreak = Math.min(streak, 10);
      probability += 0.015 * Math.log2(effectiveStreak + 1);

      const habitMaturity = Math.min(day / 30, 1.0);
      probability += 0.05 * habitMaturity;

      probability = clamp(probability, 0.05, 0.95);

      const success = Math.random() < probability ? 1 : 0;

      const history: HourlyAttempt[] = pastAttempts.map((p) => ({
        hour: p.hour,
        daysAgo: day - p.day,
        success: p.success,
      }));
      const historicalSuccessRate = hourKernelSuccessRate(history, attemptHour, RECENCY_DECAY);

      samples.push({
        raw: {
          hour: attemptHour,
          isWeekend,
          historicalSuccessRate,
          sleepHours,
          streakLength: streak,
          habitAgeDays: day,
        },
        label: success,
      });

      pastAttempts.push({ hour: attemptHour, day, success: success === 1 });
      streak = success ? streak + 1 : 0;
    }
  }

  return samples;
}

export function splitTrainValidation(
  samples: TrainingSample[],
  validationFraction = 0.2
): { train: TrainingSample[]; validation: TrainingSample[] } {
  const shuffled = [...samples];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const splitIndex = Math.floor(shuffled.length * (1 - validationFraction));
  return { train: shuffled.slice(0, splitIndex), validation: shuffled.slice(splitIndex) };
}

export function toVectorsAndLabels(samples: TrainingSample[]): { vectors: number[][]; labels: number[] } {
  return {
    vectors: samples.map((s) => toFeatureVector(s.raw)),
    labels: samples.map((s) => s.label),
  };
}
