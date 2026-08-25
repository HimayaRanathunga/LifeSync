/**
 * Step-derived activity estimates.
 *
 * Both functions return null rather than a guess when the profile measurement they need is
 * missing. Substituting an "average" height or weight would reintroduce exactly the defect these
 * replace: a number that looks measured but isn't. The UI renders "—" and prompts for the
 * measurement instead (the same approach FoodHealthDetailScreen takes for BMI).
 *
 * These are documented approximations, not device measurements — label them as estimates wherever
 * they are shown.
 */

/** Walking step length is conventionally taken as ~41.5% of standing height. */
const STRIDE_HEIGHT_RATIO = 0.415;

/**
 * The common "0.04 kcal per step" rule of thumb assumes an ~80 kg adult; dividing it out gives
 * 0.0005 kcal per step per kg, which scales to the user's actual body mass.
 */
const KCAL_PER_STEP_PER_KG = 0.0005;

export function estimateDistanceKm(steps: number, heightCm?: number): number | null {
  if (!heightCm || heightCm <= 0 || steps < 0) return null;
  const strideCm = heightCm * STRIDE_HEIGHT_RATIO;
  return (steps * strideCm) / 100_000;
}

export function estimateActiveBurnKcal(steps: number, weightKg?: number): number | null {
  if (!weightKg || weightKg <= 0 || steps < 0) return null;
  return Math.round(steps * weightKg * KCAL_PER_STEP_PER_KG);
}
