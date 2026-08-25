import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  isPedometerAvailable,
  requestStepsPermission,
  getTodayStepCountIOS,
  subscribeToLiveSteps,
} from '../services/stepsService';
import { fetchHealthLog, incrementSteps } from '../services/logsService';
import {
  subscribeToLiveStepEstimate,
  isAccelerometerAvailable,
  type LiveStepSubscription,
} from '../services/liveStepDetector';
import { toDateKey } from '../utils/dates';

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
 * Reports the three states separately — 'loading', 'unavailable' (with the reason), and 'ready' —
 * so a screen can distinguish "still fetching" from "this device has no pedometer" from a real
 * zero. A step count of 0 is a truthful answer for a user who hasn't walked yet today; callers
 * must not substitute a placeholder for it.
 *
 * Offline behaviour: the pedometer itself is a device sensor and needs no network, so live
 * counting works offline. The Firestore round-trips do not: reads fall back to a baseline of 0
 * (see below) and writes are queued in the SDK's in-memory buffer, which is lost if the app is
 * killed before reconnecting. There is no persistent cache to fall back on — the JS SDK's
 * persistentLocalCache() is IndexedDB-backed and therefore unavailable in React Native; real
 * offline durability would need @react-native-firebase/firestore and a development build.
 *
 * Known gap, not fixed here: `today` is captured once when the effect runs, so a session left
 * open past local midnight keeps attributing steps to the previous day's document.
 */
export type StepsState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: 'no-pedometer' | 'permission-denied' }
  | { status: 'ready'; steps: number };

export function useTodayStepsState(uid: string | undefined): StepsState {
  const [state, setState] = useState<StepsState>({ status: 'loading' });

  useEffect(() => {
    if (!uid) {
      setState({ status: 'loading' });
      return;
    }
    const currentUid = uid;
    let cancelled = false;
    let subscription: ReturnType<typeof subscribeToLiveSteps> | undefined;
    const today = toDateKey();
    let baseline = 0;
    let lastPersisted = 0;
    let latestTotal = 0;
    // Authoritative count from the hardware pedometer; the provisional accelerometer estimate is
    // layered on top for display only and reset whenever the hardware reports.
    let hardwareTotal = 0;
    let provisionalSteps = 0;
    let liveDetector: LiveStepSubscription | null = null;

    setState({ status: 'loading' });

    async function init() {
      const available = await isPedometerAvailable();
      console.log('[steps] isAvailableAsync ->', available);
      if (cancelled) return;
      if (!available) {
        setState({ status: 'unavailable', reason: 'no-pedometer' });
        return;
      }

      const granted = await requestStepsPermission();
      console.log('[steps] permission granted ->', granted);
      if (cancelled) return;
      if (!granted) {
        setState({ status: 'unavailable', reason: 'permission-denied' });
        return;
      }

      if (Platform.OS === 'ios') {
        try {
          baseline = await getTodayStepCountIOS();
        } catch {
          baseline = 0;
        }
      } else {
        // Must not be left unguarded: the app has no persistent Firestore cache (the JS SDK's
        // persistentLocalCache is IndexedDB-backed and unavailable in React Native), so this
        // getDoc rejects with `unavailable` whenever the device is offline and today's document
        // hasn't been read this session. Letting that reject would strand the hook in 'loading'
        // and show "—" while the user is actually walking. A baseline of 0 is the honest
        // fallback — the live delta below still counts this session's steps.
        try {
          const persisted = await fetchHealthLog(currentUid, today);
          baseline = persisted?.steps ?? 0;
        } catch {
          baseline = 0;
        }
      }
      if (cancelled) return;

      lastPersisted = baseline;
      hardwareTotal = baseline;
      console.log('[steps] baseline ->', baseline, '| platform', Platform.OS, '| date', today);
      setState({ status: 'ready', steps: baseline });

      subscription = subscribeToLiveSteps((delta) => {
        const total = baseline + delta;
        console.log('[steps] watchStepCount delta ->', delta, '| total', total);
        hardwareTotal = total;
        // The hardware has spoken — discard the provisional estimate rather than adding to it,
        // so accelerometer error can never accumulate into the stored total.
        provisionalSteps = 0;
        liveDetector?.remove();
        liveDetector = null;
        startLiveDetector();

        latestTotal = total;
        setState({ status: 'ready', steps: total });

        if (Platform.OS === 'android' && total - lastPersisted >= ANDROID_PERSIST_STEP_THRESHOLD) {
          const toPersist = total - lastPersisted;
          lastPersisted = total;
          incrementSteps(currentUid, today, toPersist).catch(() => {});
        }
      });

      // Android's hardware counter batches, so without this the display sits still for the first
      // 10-20 paces. The estimate is shown but never persisted — see liveStepDetector.ts.
      if (Platform.OS === 'android' && (await isAccelerometerAvailable()) && !cancelled) {
        startLiveDetector();
      }
    }

    function startLiveDetector() {
      if (Platform.OS !== 'android' || cancelled) return;
      liveDetector = subscribeToLiveStepEstimate((detected) => {
        provisionalSteps = detected;
        setState({ status: 'ready', steps: hardwareTotal + provisionalSteps });
      });
    }

    // A rejection anywhere in init() would otherwise surface as an unhandled promise rejection
    // and leave the hook stuck in 'loading'.
    init().catch(() => {
      if (!cancelled) setState({ status: 'unavailable', reason: 'no-pedometer' });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
      liveDetector?.remove();
      // Flush whatever hasn't crossed the batching threshold, so a short walk before the screen
      // closes isn't silently dropped.
      if (Platform.OS === 'android' && latestTotal > lastPersisted) {
        incrementSteps(currentUid, today, latestTotal - lastPersisted).catch(() => {});
      }
    };
  }, [uid]);

  return state;
}

/**
 * Convenience wrapper for callers that only need the number. Returns null for every non-ready
 * state — prefer useTodayStepsState when the UI should explain *why* there is no value.
 */
export function useTodaySteps(uid: string | undefined): number | null {
  const state = useTodayStepsState(uid);
  return state.status === 'ready' ? state.steps : null;
}
