/**
 * Minimal, dependency-free linear regression: mini-batch gradient descent with L2
 * regularisation, mean-squared-error loss. Parallel sibling of logisticRegression.ts (same
 * standardize/train/evaluate shape) but for regression targets (e.g. calories) instead of a
 * 0/1 classification — no sigmoid, raw weighted sum is the prediction.
 */

export interface TrainedLinearModel {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
}

export function standardize(vector: number[], means: number[], stds: number[]): number[] {
  return vector.map((v, i) => (v - means[i]) / (stds[i] || 1));
}

export function predict(model: TrainedLinearModel, rawVector: number[]): number {
  if (
    rawVector.length !== model.weights.length ||
    rawVector.length !== model.featureMeans.length ||
    rawVector.length !== model.featureStds.length
  ) {
    throw new Error(
      `linearRegression.predict: feature vector length (${rawVector.length}) does not match ` +
        `trained model dimensions (weights=${model.weights.length}, means=${model.featureMeans.length}, ` +
        `stds=${model.featureStds.length}) — the model is stale relative to its feature schema and must be retrained.`
    );
  }
  const x = standardize(rawVector, model.featureMeans, model.featureStds);
  return x.reduce((sum, xi, i) => sum + xi * model.weights[i], model.bias);
}

function computeMeansAndStds(vectors: number[][]): { means: number[]; stds: number[] } {
  const n = vectors.length;
  const dim = vectors[0].length;
  const means = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) means[i] += v[i] / n;

  const stds = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) stds[i] += (v[i] - means[i]) ** 2 / n;
  return { means, stds: stds.map((s) => Math.sqrt(s)) };
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  l2?: number;
  batchSize?: number;
}

/** Trains linear regression via mini-batch gradient descent. Returns the trained model plus per-epoch MSE for reporting. */
export function trainLinearRegression(
  vectors: number[][],
  labels: number[],
  options: TrainOptions = {}
): { model: TrainedLinearModel; lossHistory: number[] } {
  const { epochs = 300, learningRate = 0.1, l2 = 0.001, batchSize = 32 } = options;
  const { means, stds } = computeMeansAndStds(vectors);
  const standardized = vectors.map((v) => standardize(v, means, stds));
  const dim = standardized[0].length;

  let weights = new Array(dim).fill(0);
  let bias = 0;
  const lossHistory: number[] = [];
  const n = standardized.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (let start = 0; start < n; start += batchSize) {
      const batchIdx = indices.slice(start, start + batchSize);
      const gradW = new Array(dim).fill(0);
      let gradB = 0;

      for (const idx of batchIdx) {
        const x = standardized[idx];
        const y = labels[idx];
        const pred = x.reduce((sum, xi, i) => sum + xi * weights[i], bias);
        const error = pred - y;
        for (let i = 0; i < dim; i++) gradW[i] += (2 * error * x[i]) / batchIdx.length;
        gradB += (2 * error) / batchIdx.length;
      }

      for (let i = 0; i < dim; i++) {
        weights[i] -= learningRate * (gradW[i] + l2 * weights[i]);
      }
      bias -= learningRate * gradB;
    }

    if (epoch % 10 === 0 || epoch === epochs - 1) {
      let mse = 0;
      for (let i = 0; i < n; i++) {
        const pred = standardized[i].reduce((sum, xi, j) => sum + xi * weights[j], bias);
        mse += (pred - labels[i]) ** 2 / n;
      }
      lossHistory.push(mse);
    }
  }

  return { model: { weights, bias, featureMeans: means, featureStds: stds }, lossHistory };
}

export function evaluateMAE(model: TrainedLinearModel, vectors: number[][], labels: number[]): number {
  let totalError = 0;
  for (let i = 0; i < vectors.length; i++) {
    totalError += Math.abs(predict(model, vectors[i]) - labels[i]);
  }
  return totalError / vectors.length;
}
