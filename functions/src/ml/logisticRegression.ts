/**
 * Minimal, dependency-free logistic regression: mini-batch gradient descent with L2
 * regularisation, binary cross-entropy loss. No TensorFlow/ML library — this is intentional
 * (see README/report notes): it keeps the trained model a few dozen floats that load
 * instantly in a Cloud Function with zero native/runtime dependency risk, while still being
 * genuine supervised learning (trained weights, not hand-picked ones).
 */

export interface TrainedModel {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function standardize(vector: number[], means: number[], stds: number[]): number[] {
  return vector.map((v, i) => (v - means[i]) / (stds[i] || 1));
}

export function predictProbability(model: TrainedModel, rawVector: number[]): number {
  const x = standardize(rawVector, model.featureMeans, model.featureStds);
  const z = x.reduce((sum, xi, i) => sum + xi * model.weights[i], model.bias);
  return sigmoid(z);
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

/** Trains logistic regression via mini-batch gradient descent. Returns the trained model plus per-epoch loss for reporting. */
export function trainLogisticRegression(
  vectors: number[][],
  labels: number[],
  options: TrainOptions = {}
): { model: TrainedModel; lossHistory: number[] } {
  const { epochs = 300, learningRate = 0.1, l2 = 0.001, batchSize = 32 } = options;
  const { means, stds } = computeMeansAndStds(vectors);
  const standardized = vectors.map((v) => standardize(v, means, stds));
  const dim = standardized[0].length;

  let weights = new Array(dim).fill(0);
  let bias = 0;
  const lossHistory: number[] = [];
  const n = standardized.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Fisher-Yates shuffle of indices each epoch for mini-batching.
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
        const pred = sigmoid(x.reduce((sum, xi, i) => sum + xi * weights[i], bias));
        const error = pred - y;
        for (let i = 0; i < dim; i++) gradW[i] += (error * x[i]) / batchIdx.length;
        gradB += error / batchIdx.length;
      }

      for (let i = 0; i < dim; i++) {
        weights[i] -= learningRate * (gradW[i] + l2 * weights[i]);
      }
      bias -= learningRate * gradB;
    }

    if (epoch % 10 === 0 || epoch === epochs - 1) {
      let loss = 0;
      for (let i = 0; i < n; i++) {
        const pred = sigmoid(standardized[i].reduce((sum, xi, j) => sum + xi * weights[j], bias));
        const clamped = Math.min(Math.max(pred, 1e-7), 1 - 1e-7);
        loss += -(labels[i] * Math.log(clamped) + (1 - labels[i]) * Math.log(1 - clamped)) / n;
      }
      lossHistory.push(loss);
    }
  }

  return { model: { weights, bias, featureMeans: means, featureStds: stds }, lossHistory };
}

export function evaluateAccuracy(model: TrainedModel, vectors: number[][], labels: number[]): number {
  let correct = 0;
  for (let i = 0; i < vectors.length; i++) {
    const predicted = predictProbability(model, vectors[i]) >= 0.5 ? 1 : 0;
    if (predicted === labels[i]) correct += 1;
  }
  return correct / vectors.length;
}
