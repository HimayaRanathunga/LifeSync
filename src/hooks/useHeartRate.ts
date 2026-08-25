import { useEffect, useState } from 'react';
import { subscribeToHeartRate } from '../services/heartRateService';

/**
 * Shared live BPM reading — see heartRateService.ts for why this is simulated rather than
 * device-sourced, and why it's a single shared subscription rather than a per-screen timer.
 */
export function useHeartRate(): number {
  const [bpm, setBpm] = useState(72);
  useEffect(() => subscribeToHeartRate(setBpm), []);
  return bpm;
}
