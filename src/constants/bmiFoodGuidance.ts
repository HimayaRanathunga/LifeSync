export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export interface BmiFoodGuidance {
  category: BmiCategory;
  label: string;
  summary: string;
  recommended: string[];
  limit: string[];
}

/**
 * Simple client-side reference for the "Health Benefits" BMI page — not clinical/medical-grade
 * advice, same spirit as functions/src/food/nutritionReference.ts's calorie table (a reasonable
 * ballpark for a consumer nutrition app, not a diagnosis). Kept separate from that file since it's
 * a different concern (suitability tagging by BMI, not calorie-per-100g) and the two projects
 * (app/functions) are independently deployed — see src/types/index.ts's note on that.
 */
export const BMI_FOOD_GUIDANCE: Record<BmiCategory, BmiFoodGuidance> = {
  underweight: {
    category: 'underweight',
    label: 'Underweight',
    summary: 'Focus on calorie-dense, nutrient-rich foods to support healthy weight gain.',
    recommended: [
      'Rice, bread, and other whole grains',
      'Full-fat milk, yogurt, and cheese',
      'Nuts, cashews, and peanut butter',
      'Avocado and olive oil',
      'Chicken, fish, and eggs',
      'Bananas and dried fruit',
    ],
    limit: ['Low-calorie salads as a full meal replacement', 'Excessive caffeine before meals'],
  },
  normal: {
    category: 'normal',
    label: 'Normal weight',
    summary: 'Keep up a balanced, varied diet to maintain your current healthy range.',
    recommended: [
      'A mix of whole grains, lean protein, and vegetables',
      'Fruits and Sri Lankan greens (gotukola, mukunuwenna)',
      'Fish and legumes (dhal, chickpeas)',
      'Moderate portions of dairy',
    ],
    limit: ['Fried short eats and sugary drinks in excess', 'Very large portion sizes'],
  },
  overweight: {
    category: 'overweight',
    label: 'Overweight',
    summary: 'Favor high-fiber, lower-calorie-density foods and moderate portions.',
    recommended: [
      'Leafy greens and salads (gotukola, mukunuwenna, kankun)',
      'Lean protein — grilled fish, chicken breast, dhal',
      'High-fiber vegetables (bandakka, karawila, pumpkin)',
      'Whole grains in moderate portions',
    ],
    limit: [
      'Fries, burgers, and other fried fast food',
      'Sugary drinks, pastries, and candy',
      'Coconut-milk-heavy curries in large portions',
    ],
  },
  obese: {
    category: 'obese',
    label: 'Obese',
    summary: 'Prioritize low-calorie-density, high-fiber foods and lean protein; consider consulting a nutritionist.',
    recommended: [
      'Non-starchy vegetables and greens (salads, gotukola, karawila)',
      'Lean protein — fish, egg whites, skinless chicken',
      'Legumes (dhal, chickpeas) in place of red meat',
      'Water and unsweetened drinks over sugary beverages',
    ],
    limit: [
      'Fried foods, burgers, and pizza',
      'Sugary drinks, chocolate, and ice cream',
      'Refined carbs (white bread, pastries) in large amounts',
    ],
  },
};

export function categorizeBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

export function computeBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
