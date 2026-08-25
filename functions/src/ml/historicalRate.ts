/**
 * Shared recency- and hour-proximity-weighted success rate. Used by both the synthetic
 * training data generator and the live Cloud Function so the "historicalSuccessRate" feature
 * means exactly the same thing at train time and at inference time (train/serve skew is a
 * classic source of silently-broken ML systems).
 *
 * Weighting by hour proximity (not just an exact-hour bucket match) matters because a user
 * rarely logs a habit at literally the same minute every day — without this, most candidate
 * hours would have zero exact-match history and fall back to an uninformative 0.5 default,
 * which is what happened during development here (see PLAN.md / commit history): with
 * exact-hour bucketing the feature was nearly uncorrelated with the outcome (r ≈ 0.05); with
 * kernel smoothing across nearby hours it becomes the dominant, genuinely predictive signal.
 */

export interface HourlyAttempt {
  hour: number;
  daysAgo: number;
  success: boolean;
}

export const RECENCY_DECAY = 0.92; // each day further in the past counts ~8% less
const HOUR_KERNEL_SIGMA = 2.5;

function gaussianKernel(distance: number, sigma: number): number {
  return Math.exp(-(distance ** 2) / (2 * sigma ** 2));
}

export function hourKernelSuccessRate(
  history: HourlyAttempt[],
  targetHour: number,
  recencyDecay: number = RECENCY_DECAY
): number {
  let weightedSuccess = 0;
  let weightTotal = 0;
  for (const attempt of history) {
    const weight = Math.pow(recencyDecay, attempt.daysAgo) * gaussianKernel(attempt.hour - targetHour, HOUR_KERNEL_SIGMA);
    weightedSuccess += weight * (attempt.success ? 1 : 0);
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSuccess / weightTotal : 0.5;
}
