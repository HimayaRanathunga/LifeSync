/**
 * Simulated resting heart-rate reading — no real HR sensor is available via Expo without a
 * wearable/HealthKit/Health Connect integration (unlike steps, which the device's own pedometer
 * provides — see stepsService.ts). This is a "virtual" source: a single module-level timer drives
 * a small bounded random walk, and every screen subscribes to the SAME timer/value instead of
 * running its own independent `setInterval`, so Dashboard and Health screens never show two
 * different "live" BPM numbers at the same moment.
 */

type Listener = (bpm: number) => void;

const RESTING_MIN = 62;
const RESTING_MAX = 82;
const STEP = 1;
const TICK_MS = 4000;

let currentBpm = 72;
let listeners: Listener[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick() {
  const delta = Math.random() > 0.5 ? STEP : -STEP;
  currentBpm = Math.min(RESTING_MAX, Math.max(RESTING_MIN, currentBpm + delta));
  listeners.forEach((cb) => cb(currentBpm));
}

export function subscribeToHeartRate(cb: Listener): () => void {
  listeners.push(cb);
  cb(currentBpm);
  if (!intervalId) {
    intervalId = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}
