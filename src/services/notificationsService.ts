import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Habit } from '../types';
import type { LocalRecommendation } from '../ml/recommender';

/**
 * Adaptive habit reminders.
 *
 * Reminder times come from the on-device model (src/ml/recommender.ts), not from a fixed
 * schedule, so as the model learns from logged completions the reminders move with it. Because
 * the model runs locally, this works with no network and no deployed backend.
 *
 * Scope note: these are *local* scheduled notifications, which Expo Go supports. Remote push
 * (a server waking the device) is a different mechanism and is not implemented — nothing in the
 * app claims otherwise.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = 'habit-reminders';

/** Clears every scheduled habit reminder — used when the user turns notifications off. */
export async function disableHabitReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function ensureNotificationSetup(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  // Only prompt when the decision hasn't been made yet: re-requesting a denied permission is a
  // no-op on both platforms and just burns a round trip.
  const { status } = existing.granted
    ? existing
    : existing.canAskAgain
      ? await Notifications.requestPermissionsAsync()
      : existing;

  if (status !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Habit reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return true;
}

export interface SyncResult {
  scheduled: number;
  /** False when the user declined the OS permission — the caller should stop claiming reminders work. */
  permitted: boolean;
}

/**
 * Cancels every previously scheduled habit reminder and reschedules from the current
 * recommendations. Re-running after each recommendation change is what keeps the reminder times
 * adaptive; scheduling is cheap and cancelling first avoids duplicates accumulating.
 *
 * One reminder is scheduled per habit per scheduled weekday. A DAILY trigger would fire a
 * Monday/Wednesday/Friday habit on all seven days, which trains the user to ignore the app.
 */
export async function syncHabitReminders(
  recommendations: LocalRecommendation[],
  habits: Habit[]
): Promise<SyncResult> {
  const granted = await ensureNotificationSetup();
  if (!granted) return { scheduled: 0, permitted: false };

  await Notifications.cancelAllScheduledNotificationsAsync();

  const habitsById = new Map(habits.map((h) => [h.id, h]));
  let scheduled = 0;

  for (const rec of recommendations) {
    const habit = habitsById.get(rec.habitId);
    if (!habit) continue;

    const hour = rec.suggestedHour;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

    // An empty daysOfWeek means "every day" — expand it so the loop below is uniform.
    const days = habit.daysOfWeek.length > 0 ? habit.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

    for (const day of days) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time for: ${habit.title}`,
          body: rec.reason,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // expo-notifications counts weekdays 1-7 starting at Sunday; Date.getDay() is 0-6.
          weekday: day + 1,
          hour,
          minute: 0,
          channelId: CHANNEL_ID,
        },
      });
      scheduled += 1;
    }
  }

  return { scheduled, permitted: true };
}

/** What is currently scheduled — used by Settings to show the real state rather than assuming. */
export async function getScheduledReminderCount(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.length;
}
