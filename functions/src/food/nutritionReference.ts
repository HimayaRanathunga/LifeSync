/**
 * Curated reference table of typical calories-per-100g by common food category, used to
 * synthesize training data for the calorie calibration model (see calorieSyntheticData.ts) and
 * to match Gemini's free-text food item names against a category at inference time
 * (analyzeFoodPhoto.ts).
 *
 * Values are typical/approximate figures for common preparations of each category (the kind of
 * number any consumer nutrition app or food label ballparks to) — a reasonable reference for a
 * demonstration calibration model, not clinical/medical-grade nutrition data.
 */

export interface FoodCategory {
  category: string;
  caloriesPer100g: number;
  keywords: string[];
}

export const NUTRITION_REFERENCE: FoodCategory[] = [
  { category: 'rice', caloriesPer100g: 130, keywords: ['rice'] },
  { category: 'chicken', caloriesPer100g: 165, keywords: ['chicken', 'poultry'] },
  { category: 'beef', caloriesPer100g: 250, keywords: ['beef', 'steak'] },
  { category: 'fish', caloriesPer100g: 200, keywords: ['fish', 'salmon', 'tuna', 'seafood'] },
  { category: 'egg', caloriesPer100g: 155, keywords: ['egg'] },
  { category: 'bread', caloriesPer100g: 265, keywords: ['bread', 'toast', 'bun'] },
  { category: 'pasta', caloriesPer100g: 131, keywords: ['pasta', 'noodle', 'spaghetti'] },
  { category: 'pizza', caloriesPer100g: 266, keywords: ['pizza'] },
  { category: 'burger', caloriesPer100g: 295, keywords: ['burger', 'hamburger'] },
  { category: 'fries', caloriesPer100g: 312, keywords: ['fries', 'chips'] },
  { category: 'salad', caloriesPer100g: 20, keywords: ['salad', 'lettuce', 'greens', 'gotukola', 'mukunuwenna', 'kankun', 'kathurumurunga', 'mallum', 'sambol'] },
  { category: 'polos', caloriesPer100g: 85, keywords: ['polos', 'jackfruit', 'kos', 'tender jackfruit'] },
  { category: 'dhal', caloriesPer100g: 115, keywords: ['dhal', 'parippu', 'lentil', 'dal'] },
  { category: 'bandakka', caloriesPer100g: 45, keywords: ['bandakka', 'okra', 'ladies finger'] },
  { category: 'brinjal', caloriesPer100g: 110, keywords: ['brinjal', 'eggplant', 'aubergine', 'batu', 'wambatu', 'moju'] },
  { category: 'pumpkin', caloriesPer100g: 42, keywords: ['pumpkin', 'wattakka', 'squash'] },
  { category: 'bittergourd', caloriesPer100g: 48, keywords: ['karawila', 'bitter gourd', 'bitter melon'] },
  { category: 'drumstick', caloriesPer100g: 50, keywords: ['murunga', 'drumstick', 'moringa'] },
  { category: 'gourds', caloriesPer100g: 32, keywords: ['pathola', 'snake gourd', 'wetakolu', 'ridge gourd', 'labu', 'bottle gourd'] },
  { category: 'rootveg', caloriesPer100g: 65, keywords: ['kohila', 'nelum ala', 'lotus root', 'manioc', 'cassava', 'sweet potato', 'bathala', 'kiri ala'] },
  { category: 'kottu', caloriesPer100g: 185, keywords: ['kottu', 'kotthu', 'godamba'] },
  { category: 'hoppers', caloriesPer100g: 135, keywords: ['hopper', 'appa', 'string hopper', 'idiyappam', 'pittu', 'roti'] },
  { category: 'banana', caloriesPer100g: 89, keywords: ['banana', 'plantain', 'alu kesel'] },
  { category: 'apple', caloriesPer100g: 52, keywords: ['apple'] },
  { category: 'orange', caloriesPer100g: 47, keywords: ['orange'] },
  { category: 'yogurt', caloriesPer100g: 61, keywords: ['yogurt', 'yoghurt', 'curd', 'mee kiri'] },
  { category: 'milk', caloriesPer100g: 50, keywords: ['milk'] },
  { category: 'cheese', caloriesPer100g: 402, keywords: ['cheese'] },
  { category: 'potato', caloriesPer100g: 87, keywords: ['potato', 'ala', 'theldhala'] },
  { category: 'avocado', caloriesPer100g: 160, keywords: ['avocado', 'ali geta pera'] },
  { category: 'nuts', caloriesPer100g: 576, keywords: ['nuts', 'almond', 'peanut', 'cashew', 'kaju'] },
  { category: 'chocolate', caloriesPer100g: 546, keywords: ['chocolate'] },
  { category: 'ice cream', caloriesPer100g: 207, keywords: ['ice cream', 'icecream', 'gelato'] },
  { category: 'soup', caloriesPer100g: 40, keywords: ['soup', 'broth', 'kenda', 'kola kenda'] },
  { category: 'curry', caloriesPer100g: 140, keywords: ['curry', 'hodi', 'kiri hodi', 'ambulthiyal'] },
];

export const CATEGORY_NAMES = NUTRITION_REFERENCE.map((c) => c.category);

/**
 * Matches a free-text food name (e.g. Gemini's "grilled chicken breast with herbs") against the
 * reference table by keyword containment. Returns null on no confident match — callers must not
 * force a fallback to the nearest category, since a wrong forced match (e.g. "protein bar" →
 * "bread") would inject a confidently-wrong calibration signal, worse than no calibration.
 */
export function matchFoodCategory(name: string): FoodCategory | null {
  const lower = name.toLowerCase();
  for (const entry of NUTRITION_REFERENCE) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry;
    }
  }
  return null;
}
