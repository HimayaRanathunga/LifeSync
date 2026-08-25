// Helper for verify_parity.py: reads test cases as JSON on argv and prints the TS feature vectors.
// Not part of the app bundle.
import { toFeatureVector } from '../src/ml/features';
import { hourKernelSuccessRate } from '../src/ml/historicalRate';

import * as fs from 'fs';
// Cases arrive via a temp file: on Windows a 300-case JSON payload exceeds the command-line
// length limit.
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = cases.map((c: any) => {
  const { rate, evidence } = hourKernelSuccessRate(c.history, c.hour);
  return {
    rate,
    evidence,
    vector: toFeatureVector({ ...c, historicalSuccessRate: rate, evidence }),
  };
});
process.stdout.write(JSON.stringify(out));
