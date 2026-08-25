import type { Ionicons } from '@expo/vector-icons';

/**
 * Dashboard alerts derived from the day's real logged state.
 *
 * This replaces a hardcoded array of five invented notifications (including one that restated a
 * fake step count). Every alert below is produced only when the underlying data actually says so,
 * and carries no relative-time string, because nothing here has a timestamp to report — an alert
 * describes the *current* state of the day, not a past event.
 */
export interface DashboardAlert {
  id: string;
  title: string;
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

export interface AlertInputs {
  steps: number | null;
  stepTarget: number;
  waterMl: number | null;
  waterTargetMl: number;
  caloriesLogged: number;
  calorieTarget: number;
  foodLogCount: number;
  habitsTotal: number;
  habitsDone: number;
  /** Local hour 0-23, so "you haven't logged a meal yet" doesn't fire at 8am. */
  hour: number;
}

export function buildDashboardAlerts(input: AlertInputs): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (input.waterMl !== null && input.waterMl < input.waterTargetMl) {
    const remaining = input.waterTargetMl - input.waterMl;
    alerts.push({
      id: 'water',
      title: 'Hydration',
      message: `${input.waterMl.toLocaleString()} ml logged — ${remaining.toLocaleString()} ml left to reach your ${input.waterTargetMl.toLocaleString()} ml goal.`,
      icon: 'water',
      color: '#0284C7',
      bg: '#E0F2FE',
    });
  }

  if (input.steps !== null) {
    if (input.steps >= input.stepTarget) {
      alerts.push({
        id: 'steps-done',
        title: 'Step goal reached',
        message: `${input.steps.toLocaleString()} steps today, past your ${input.stepTarget.toLocaleString()} goal.`,
        icon: 'footsteps',
        color: '#7C3AED',
        bg: '#EDE9FE',
      });
    } else {
      const pct = Math.round((input.steps / input.stepTarget) * 100);
      alerts.push({
        id: 'steps',
        title: `Step goal: ${pct}%`,
        message: `${input.steps.toLocaleString()} of ${input.stepTarget.toLocaleString()} steps — ${(input.stepTarget - input.steps).toLocaleString()} to go.`,
        icon: 'footsteps',
        color: '#7C3AED',
        bg: '#EDE9FE',
      });
    }
  }

  // Only after midday, so an empty morning isn't reported as a missed meal.
  if (input.foodLogCount === 0 && input.hour >= 14) {
    alerts.push({
      id: 'no-meals',
      title: 'No meals logged',
      message: 'Scan a meal to track today’s calories and macros.',
      icon: 'restaurant',
      color: '#059669',
      bg: '#D1FAE5',
    });
  } else if (input.foodLogCount > 0 && input.caloriesLogged > input.calorieTarget) {
    alerts.push({
      id: 'over-calories',
      title: 'Over your calorie target',
      message: `${input.caloriesLogged.toLocaleString()} kcal logged against a ${input.calorieTarget.toLocaleString()} kcal target.`,
      icon: 'flame',
      color: '#EA580C',
      bg: '#FFEDD5',
    });
  }

  if (input.habitsTotal > 0) {
    const remaining = input.habitsTotal - input.habitsDone;
    alerts.push(
      remaining === 0
        ? {
            id: 'habits-done',
            title: 'All habits done',
            message: `You completed all ${input.habitsTotal} habits today.`,
            icon: 'checkmark-circle',
            color: '#059669',
            bg: '#D1FAE5',
          }
        : {
            id: 'habits',
            title: `${input.habitsDone} of ${input.habitsTotal} habits done`,
            message: `${remaining} habit${remaining === 1 ? '' : 's'} still to complete today.`,
            icon: 'list',
            color: '#4F46E5',
            bg: '#E0E7FF',
          }
    );
  }

  return alerts;
}
