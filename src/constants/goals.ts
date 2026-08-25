import type { DailyGoals, Macros } from '../types';

export const DEFAULT_DAILY_GOALS: DailyGoals = {
  calorieTarget: 2000,
  waterTargetMl: 2500,
  stepTarget: 8000,
};

/**
 * Balanced macro split, used to derive gram targets from the user's own calorie target.
 * These are the midpoints of the WHO/IOM Acceptable Macronutrient Distribution Ranges
 * (carbohydrate 45-65%, protein 10-35%, fat 20-35%) — the same spirit as
 * constants/bmiFoodGuidance.ts: a defensible consumer-app reference, not clinical prescription.
 *
 * Derived at render time rather than stored, so the gram targets can never drift out of sync
 * with calorieTarget when the user edits it in Settings.
 */
export const MACRO_SPLIT = { carbs: 0.5, protein: 0.2, fat: 0.3 } as const;

const KCAL_PER_GRAM = { carbs: 4, protein: 4, fat: 9 } as const;

export function deriveMacroTargets(calorieTarget: number): Macros {
  const safeTarget = calorieTarget > 0 ? calorieTarget : DEFAULT_DAILY_GOALS.calorieTarget;
  return {
    carbsGrams: Math.round((safeTarget * MACRO_SPLIT.carbs) / KCAL_PER_GRAM.carbs),
    proteinGrams: Math.round((safeTarget * MACRO_SPLIT.protein) / KCAL_PER_GRAM.protein),
    fatGrams: Math.round((safeTarget * MACRO_SPLIT.fat) / KCAL_PER_GRAM.fat),
  };
}

/**
 * Guards a goal read from Firestore. The Settings editor does not currently validate its input,
 * so a negative or non-finite target can already exist in a user document; passing one through
 * would make every progress ring in the app render a negative or NaN width.
 */
export function positiveGoalOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
