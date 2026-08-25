export type Goal = 'fitness' | 'study' | 'work-life-balance';

export interface DailyGoals {
  calorieTarget: number;
  waterTargetMl: number;
  stepTarget: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  wakeTime: string; // "HH:mm"
  workStart: string; // "HH:mm"
  workEnd: string; // "HH:mm"
  goals: Goal[];
  createdAt: number;
  // Optional: absent on profiles created before this feature existed — callers fall back to
  // src/constants/goals.ts's DEFAULT_DAILY_GOALS.
  dailyGoals?: DailyGoals;
  // Optional: undefined means "on," matching the original always-on behavior for profiles
  // created before this setting existed.
  notificationsEnabled?: boolean;
  // Optional: absent until the user fills these in (e.g. via the BMI-based food guidance page) —
  // no onboarding step collects them yet.
  heightCm?: number;
  weightKg?: number;
}

export interface Habit {
  id: string;
  title: string;
  recurring: boolean;
  daysOfWeek: number[]; // 0 (Sun) - 6 (Sat)
  preferredTime: string; // "HH:mm"
  createdAt: number;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // "YYYY-MM-DD"
  completedAt: string | null; // "HH:mm" if completed, null if missed
  success: boolean;
}

export interface Recommendation {
  habitId: string;
  suggestedTime: string; // "HH:mm"
  score: number; // 0-1 success-likelihood score
  reason: string;
  generatedAt: number;
}

export interface HealthLog {
  id: string;
  date: string; // "YYYY-MM-DD"
  sleepHours: number;
  waterMl: number;
  steps: number;
}

export interface FoodItem {
  name: string;
  estimatedPortion: string;
  estimatedPortionGrams: number;
  calories: number;
  // Present only when the item's name confidently matched a category in the calorie
  // calibration model's reference table — see functions/src/food/nutritionReference.ts.
  matchedCategory?: string;
  calibratedCalories?: number;
}

export interface Macros {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface FoodAnalysis {
  foodItems: FoodItem[];
  totalCalories: number;
  macros: Macros;
  condition: string;
  healthTip: string;
  confidence: number; // 0-1
  isFood?: boolean; // false when non-food object is detected
  nonFoodReason?: string;
  mealTitle?: string; // AI-suggested catchy meal name (e.g. "Grilled Chicken Quinoa Bowl")
  imageUri?: string; // Captured photo URI
  healthRating?: 'GOOD' | 'MODERATE' | 'BAD';
  healthScore?: number; // 0-100
  healthVerdict?: string;
  habitImpactStatus?: 'EXCELLENT_FOR_HABITS' | 'GOOD_FOR_HABITS' | 'MODERATE_FOR_HABITS' | 'POOR_FOR_HABITS';
  habitImpactReason?: string;
  sriLankanDishType?: string;
  // Present only when at least one food item was cross-checked against the calorie
  // calibration model — absent (not a generic default) when nothing matched.
  calibrationNote?: string;
  calibrationAvgDiffPct?: number;
  // True when this result is a canned example (Gemini + Cloud Function both failed/timed out),
  // not a real analysis of the photo — see FALLBACK_MEALS in src/services/foodService.ts.
  isFallback?: boolean;
}

export interface FoodLog extends FoodAnalysis {
  id: string;
  date: string; // "YYYY-MM-DD"
  createdAt: number;
}

// Mirrors functions/src/food/analyzeFoodPhoto.ts's AnalyzeFoodRequest — kept as a separate
// local copy (not a cross-project import) since app/ and functions/ are independently
// deployed npm projects with their own dependency trees.
export interface AnalyzeFoodRequest {
  imageBase64: string;
  mimeType?: string;
}
