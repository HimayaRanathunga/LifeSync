import { Pedometer } from 'expo-sensors';

/**
 * Thin wrapper around expo-sensors' Pedometer (mirrors weatherService.ts's permission-gated,
 * graceful-fallback style). Platform note: Pedometer.getStepCountAsync (a true since-a-date
 * total) is iOS-only — the native Android module throws NotSupportedException for it, so callers
 * must branch on Platform.OS rather than calling it unconditionally (see useTodaySteps.ts, which
 * owns that platform logic).
 */

export async function isPedometerAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestStepsPermission(): Promise<boolean> {
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** True since-midnight step count. iOS only — throws on Android, callers must check Platform.OS first. */
export async function getTodayStepCountIOS(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { steps } = await Pedometer.getStepCountAsync(start, new Date());
  return steps;
}

/** Live step-delta subscription (both platforms) — counts from the moment this is called, not from midnight. */
export function subscribeToLiveSteps(callback: (steps: number) => void) {
  return Pedometer.watchStepCount((result) => callback(result.steps));
}
