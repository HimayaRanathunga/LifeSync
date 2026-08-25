/**
 * Inference for the habit-timing logistic regression model.
 *
 * Training lives in ml_python/train_habit_recommender.py (scikit-learn); Python cannot run on a
 * phone, so only the fitted weights ship. That is the whole point of choosing a linear model here:
 * scoring is a dot product and a sigmoid over a few dozen floats, cheap enough to evaluate
 * on-device with no native ML runtime, no model download and no network — so recommendations work
 * offline and are available immediately after install.
 *
 * There is deliberately no training code in this file. A second trainer would drift from the
 * Python one, and a model fitted by one and served by the other is train/serve skew that nothing
 * would report. ml_python/verify_parity.py checks the two feature pipelines still agree.
 */

export interface TrainedModel {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
  featureNames: readonly string[];
}

function sigmoid(z: number): number {
  // Split by sign to avoid Math.exp overflowing to Infinity for large negative z.
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function standardize(vector: number[], means: number[], stds: number[]): number[] {
  return vector.map((v, i) => {
    const std = stds[i];
    // A constant feature has zero variance; dividing by it would produce NaN and poison every
    // downstream weight.
    return std > 1e-9 ? (v - means[i]) / std : 0;
  });
}

export function predictProbability(model: TrainedModel, rawVector: number[]): number {
  if (rawVector.length !== model.weights.length) {
    throw new Error(
      `predictProbability: feature vector length (${rawVector.length}) does not match the ` +
        `trained model (${model.weights.length}). The model on disk is stale — re-run training.`
    );
  }
  const x = standardize(rawVector, model.featureMeans, model.featureStds);
  let z = model.bias;
  for (let i = 0; i < x.length; i++) z += model.weights[i] * x[i];
  return sigmoid(z);
}
