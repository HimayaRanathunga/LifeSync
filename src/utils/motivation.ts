interface ProgressSnapshot {
  caloriesProgress: number;
  waterProgress: number;
  stepsProgress: number;
}

/** Simple rule-based copy reacting to today's goal progress — not ML, just UI copy logic. */
export function getMotivationalMessage({ caloriesProgress, waterProgress, stepsProgress }: ProgressSnapshot): string | null {
  if (caloriesProgress >= 1 && waterProgress >= 1 && stepsProgress >= 1) {
    return 'You hit all your goals today!';
  }

  const nearGoals: string[] = [];
  if (waterProgress >= 0.8 && waterProgress < 1) nearGoals.push('water');
  if (stepsProgress >= 0.8 && stepsProgress < 1) nearGoals.push('step');
  if (caloriesProgress >= 0.8 && caloriesProgress < 1) nearGoals.push('calorie');

  if (nearGoals.length > 0) {
    return `Almost at your ${nearGoals[0]} goal!`;
  }

  return null;
}
