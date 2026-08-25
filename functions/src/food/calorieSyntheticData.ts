/**
 * Synthetic training data for the calorie calibration model. Same philosophy as
 * functions/src/ml/syntheticData.ts: there's no real logged-calorie dataset to train on (Gemini's
 * output isn't ground truth, and no user corrections are collected yet), so training examples are
 * generated around the curated reference table (nutritionReference.ts) with added noise — plausible,
 * not fabricated precision. The model's job is to recover `caloriesPer100g * portion/100` from noisy
 * examples, exercising a genuine standardize -> train -> evaluate pipeline.
 */

import { NUTRITION_REFERENCE, CATEGORY_NAMES } from './nutritionReference';

export interface CalorieSample {
  portionGrams: number;
  category: string;
  calories: number; // label
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomNormal(mean: number, stdDev: number): number {
  // Box-Muller transform.
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

const PORTION_MIN_G = 50;
const PORTION_MAX_G = 500;
const PORTION_CAP_G = 600; // feature normalisation cap, mirrors the min()/cap pattern in ml/features.ts
const NOISE_RELATIVE_STD = 0.12; // +-12% noise around the reference-implied calorie value

export function generateCalorieDataset(samplesPerCategory = 60): CalorieSample[] {
  const samples: CalorieSample[] = [];
  for (const entry of NUTRITION_REFERENCE) {
    for (let i = 0; i < samplesPerCategory; i++) {
      const portionGrams = randomBetween(PORTION_MIN_G, PORTION_MAX_G);
      const expected = (entry.caloriesPer100g * portionGrams) / 100;
      const calories = Math.max(0, randomNormal(expected, expected * NOISE_RELATIVE_STD));
      samples.push({ portionGrams, category: entry.category, calories });
    }
  }
  return samples;
}

export function splitTrainValidation(
  samples: CalorieSample[],
  validationFraction = 0.2
): { train: CalorieSample[]; validation: CalorieSample[] } {
  const shuffled = [...samples];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const splitIndex = Math.floor(shuffled.length * (1 - validationFraction));
  return { train: shuffled.slice(0, splitIndex), validation: shuffled.slice(splitIndex) };
}

/** Feature order: [portionGramsNorm, ...oneHotCategory] — CATEGORY_NAMES order, shared with analyzeFoodPhoto.ts. */
export function toFeatureVector(portionGrams: number, category: string): number[] {
  const oneHot = CATEGORY_NAMES.map((name) => (name === category ? 1 : 0));
  return [Math.min(portionGrams, PORTION_CAP_G) / PORTION_CAP_G, ...oneHot];
}

export function toVectorsAndLabels(samples: CalorieSample[]): { vectors: number[][]; labels: number[] } {
  return {
    vectors: samples.map((s) => toFeatureVector(s.portionGrams, s.category)),
    labels: samples.map((s) => s.calories),
  };
}
