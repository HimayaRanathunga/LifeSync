import { Accelerometer } from 'expo-sensors';

/**
 * Accelerometer peak-detection step counter, used to fill the gap between hardware pedometer
 * events.
 *
 * Why: expo-sensors' Pedometer is backed by Android's `Sensor.TYPE_STEP_COUNTER`
 * (see PedometerModule.kt), a hardware counter whose firmware batches readings to save power —
 * typically 10-20 steps or several seconds pass before an event is delivered. The sampling rate
 * requested from JS makes no difference; the batching happens below the OS. Walking a few paces
 * therefore appears to do nothing, which reads as a broken step counter.
 *
 * This detector runs the classic accelerometer pipeline — magnitude, low-pass filter, thresholded
 * peak detection with a refractory period — to produce an immediate, *provisional* count. It is
 * deliberately NOT the source of truth: useTodaySteps snaps back to the hardware total every time
 * the pedometer reports, so any drift here is corrected within seconds and never accumulates.
 *
 * Accuracy caveat, stated plainly: peak detection on a hand-held phone will miss some steps and
 * invent others (shaking the device registers as walking). That is acceptable for a value whose
 * lifetime is a few seconds before the hardware corrects it, and unacceptable as a stored total —
 * which is why nothing here is ever persisted.
 */

/** 20 Hz. Walking cadence peaks around 3 steps/s, so this is comfortably above Nyquist while
 *  costing far less battery than the 50-100 Hz used in gait research. */
const SAMPLE_INTERVAL_MS = 50;

/** Smoothing factor for the low-pass filter: higher = more responsive, noisier. */
const SMOOTHING = 0.3;

/** Magnitude (in g) above the smoothed baseline that counts as a step impact. */
const PEAK_THRESHOLD_G = 0.12;

/** Minimum gap between steps — 250 ms caps the detector at 240 steps/min, well above a sprint,
 *  and stops a single impact registering as several steps. */
const REFRACTORY_MS = 250;

export interface LiveStepSubscription {
  remove: () => void;
}

export function subscribeToLiveStepEstimate(
  onStep: (totalSinceStart: number) => void
): LiveStepSubscription {
  let smoothed = 1; // resting magnitude is ~1g
  let steps = 0;
  let lastStepAt = 0;
  let armed = false; // require a dip below the threshold before counting the next peak

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

  const sub = Accelerometer.addListener(({ x, y, z }) => {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    smoothed = smoothed + SMOOTHING * (magnitude - smoothed);

    const deviation = magnitude - smoothed;
    const now = Date.now();

    if (!armed && deviation < PEAK_THRESHOLD_G * 0.4) {
      // Fell back toward baseline — ready to count the next impact.
      armed = true;
      return;
    }

    if (armed && deviation > PEAK_THRESHOLD_G && now - lastStepAt > REFRACTORY_MS) {
      steps += 1;
      lastStepAt = now;
      armed = false;
      onStep(steps);
    }
  });

  return {
    remove: () => sub.remove(),
  };
}

export async function isAccelerometerAvailable(): Promise<boolean> {
  try {
    return await Accelerometer.isAvailableAsync();
  } catch {
    return false;
  }
}
