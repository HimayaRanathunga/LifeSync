import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  isPedometerAvailable,
  requestStepsPermission,
  getTodayStepCountIOS,
  subscribeToLiveSteps,
} from '../services/stepsService';
import { fetchHealthLog, incrementSteps } from '../services/logsService';

// Avoids writing to Firestore on every single step on Android — only persists once the
// unsaved delta crosses this many steps.
const ANDROID_PERSIST_STEP_THRESHOLD = 20;

/**
 * Today's step count, shared between the Dashboard widget and the Health screen so the
 * platform-branching logic below lives in one place.
 *
 * iOS: Pedometer.getStepCountAsync gives a true since-midnight total, so that's the baseline;
 * the live watchStepCount delta is added on top for real-time updates while the screen is open.
 *
 * Android: getStepCountAsync isn't available at all (the native module throws
 * NotSupportedException for it) — there is no device-side "since midnight" query. The baseline
 * instead comes from whatever was last persisted to today's Firestore health doc, with the live
 * session delta layered on top and periodically flushed back via incrementSteps so it survives
 * across app opens. Real limitation: steps taken before the app was opened today, on a day the
 * app hasn't been opened yet, aren't counted — Health Connect would fix this but isn't wired up.
 *
 * Returns null while unavailable/permission-denied/loading, so callers can render "—".
 */
export function useTodaySteps(uid: string | undefined): number | null {
  const [steps, setSteps] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    const currentUid = uid;
    let cancelled = false;
    let subscription: ReturnType<typeof subscribeToLiveSteps> | undefined;
    const today = new Date().toISOString().slice(0, 10);
    let baseline = 0;
    let lastPersisted = 0;

    async function init() {
      const available = await isPedometerAvailable();
      if (!available || cancelled) return;

      const granted = await requestStepsPermission();
      if (!granted || cancelled) return;

      if (Platform.OS === 'ios') {
        try {
          baseline = await getTodayStepCountIOS();
        } catch {
          baseline = 0;
        }
      } else {
        const persisted = await fetchHealthLog(currentUid, today);
        baseline = persisted?.steps ?? 0;
      }
      if (cancelled) return;

      lastPersisted = baseline;
      setSteps(baseline);

      subscription = subscribeToLiveSteps((delta) => {
        const total = baseline + delta;
        setSteps(total);

        if (Platform.OS === 'android' && total - lastPersisted >= ANDROID_PERSIST_STEP_THRESHOLD) {
          const toPersist = total - lastPersisted;
          lastPersisted = total;
          incrementSteps(currentUid, today, toPersist).catch(() => {});
        }
      });
    }

    init();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [uid]);

  return steps;
}
