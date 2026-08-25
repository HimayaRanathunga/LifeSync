/**
 * Live inference using the model trained by train.ts. For each candidate hour, scores
 * predicted success probability and returns the best slot. Callers should fall back to the
 * rule-based recommender (recommendationEngine.ts) when a habit has too little history —
 * the trained model expects a real historicalSuccessRate signal, not a cold-start default.
 */

import { toFeatureVector, type RawFeatures } from './features';
import { predictProbability } from './logisticRegression';
import { trainedModel } from './model/weights.generated';

export const CANDIDATE_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00-22:00

export interface MlContext {
  isWeekend: boolean;
  hourlySuccessRates: Map<number, number>; // hour -> recency-weighted success rate
  sleepHours: number;
  streakLength: number;
  habitAgeDays: number;
}

export interface MlRecommendation {
  suggestedHour: number;
  probability: number;
}

export function recommendHourWithModel(context: MlContext): MlRecommendation {
  let best: MlRecommendation = { suggestedHour: CANDIDATE_HOURS[0], probability: -1 };

  for (const hour of CANDIDATE_HOURS) {
    const raw: RawFeatures = {
      hour,
      isWeekend: context.isWeekend,
      historicalSuccessRate: context.hourlySuccessRates.get(hour) ?? 0.5,
      sleepHours: context.sleepHours,
      streakLength: context.streakLength,
      habitAgeDays: context.habitAgeDays,
    };
    const probability = predictProbability(trainedModel, toFeatureVector(raw));
    if (probability > best.probability) {
      best = { suggestedHour: hour, probability };
    }
  }

  return best;
}
