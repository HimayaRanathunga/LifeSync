import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Recommendation } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Clears every scheduled habit reminder — used when the user turns notifications off in Settings. */
export async function disableHabitReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function ensureNotificationSetup(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return true;
}

/**
 * Adaptive reminders: cancels every previously scheduled habit notification and reschedules
 * fresh ones from the latest AI recommendations. Since recommendations shift as the model
 * learns (e.g. a missed 7am slot nudges tomorrow's suggestion to 8am), re-running this after
 * every recommendation update keeps the actual reminder times in sync automatically.
 */
export async function syncHabitReminders(
  recommendations: Recommendation[],
  habitTitlesById: Record<string, string>
): Promise<void> {
  const granted = await ensureNotificationSetup();
  if (!granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const rec of recommendations) {
    const [hourStr, minuteStr] = rec.suggestedTime.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

    const title = habitTitlesById[rec.habitId] ?? 'Habit reminder';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time for: ${title}`,
        body: rec.reason,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: 'habit-reminders',
      },
    });
  }
}
