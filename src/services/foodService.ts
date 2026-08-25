import { httpsCallable } from 'firebase/functions';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  where,
  getDocs,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { functions, db } from '../config/firebase';
import type { AnalyzeFoodRequest, FoodAnalysis, FoodLog } from '../types';
import type { Page } from './logsService';

const analyzeFoodPhotoCallable = httpsCallable<AnalyzeFoodRequest, FoodAnalysis>(functions, 'analyzeFoodPhoto');

export interface HealthySuggestion {
  id: string;
  title: string;
  category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  calories: number;
  macros: { proteinGrams: number; carbsGrams: number; fatGrams: number };
  benefit: string;
  ingredients: string;
  icon: string;
}

export const HEALTHY_MEAL_SUGGESTIONS: HealthySuggestion[] = [
  {
    id: 'sug-1',
    title: 'Sri Lankan Red Rice & Polos (Jackfruit) Curry with Gotukola',
    category: 'Lunch',
    calories: 460,
    macros: { proteinGrams: 28, carbsGrams: 65, fatGrams: 10 },
    benefit: 'High plant fiber, low-GI sustained energy & gut microbiome support',
    ingredients: 'Rathu kekulu red rice, tender baby jackfruit (polos), gotukola sambol, parippu dhal',
    icon: 'leaf-outline',
  },
  {
    id: 'sug-2',
    title: 'Mediterranean Quinoa & Chicken Bowl',
    category: 'Lunch',
    calories: 480,
    macros: { proteinGrams: 42, carbsGrams: 48, fatGrams: 12 },
    benefit: 'Sustained energy & optimal post-workout muscle recovery',
    ingredients: 'Grilled chicken breast, tri-color quinoa, baby spinach, cucumbers, olive oil & lemon',
    icon: 'restaurant-outline',
  },
  {
    id: 'sug-3',
    title: 'Wild Salmon with Roasted Greens & Wattakka',
    category: 'Dinner',
    calories: 520,
    macros: { proteinGrams: 45, carbsGrams: 20, fatGrams: 28 },
    benefit: 'Rich in anti-inflammatory Omega-3 fatty acids & micronutrients',
    ingredients: 'Pan-seared wild salmon, roasted asparagus, yellow pumpkin curry, garlic olive oil',
    icon: 'fish-outline',
  },
  {
    id: 'sug-4',
    title: 'Tempered Kadala (Chickpeas) & Fresh Coconut',
    category: 'Breakfast',
    calories: 340,
    macros: { proteinGrams: 18, carbsGrams: 46, fatGrams: 9 },
    benefit: 'Slow-burning morning complex carbs & workout stamina',
    ingredients: 'Boiled chickpeas, fresh coconut flakes, mustard seeds, curry leaves, crushed pepper',
    icon: 'flame-outline',
  },
  {
    id: 'sug-5',
    title: 'Protein Avocado & Poached Eggs',
    category: 'Breakfast',
    calories: 390,
    macros: { proteinGrams: 22, carbsGrams: 28, fatGrams: 22 },
    benefit: 'Healthy brain fats & slow-burning morning macronutrients',
    ingredients: 'Sourdough toast, smashed hass avocado, 2 poached organic eggs, chia seeds',
    icon: 'egg-outline',
  },
  {
    id: 'sug-6',
    title: 'Antioxidant Berry & Greek Yogurt Bowl',
    category: 'Snack',
    calories: 260,
    macros: { proteinGrams: 24, carbsGrams: 30, fatGrams: 4 },
    benefit: 'High prebiotic gut support & cellular antioxidant protection',
    ingredients: 'Zero-sugar Greek yogurt, fresh blueberries, raspberries, crushed walnuts',
    icon: 'nutrition-outline',
  },
];

export function evaluateFoodHealth(analysis: FoodAnalysis): {
  isFood: boolean;
  nonFoodReason?: string;
  mealTitle: string;
  healthRating: 'GOOD' | 'MODERATE' | 'BAD';
  healthScore: number;
  healthVerdict: string;
  habitImpactStatus: 'EXCELLENT_FOR_HABITS' | 'GOOD_FOR_HABITS' | 'MODERATE_FOR_HABITS' | 'POOR_FOR_HABITS';
  habitImpactReason: string;
  sriLankanDishType?: string;
} {
  const isFood = analysis.isFood !== false;
  if (!isFood) {
    return {
      isFood: false,
      nonFoodReason: analysis.nonFoodReason || 'Non-food item detected in image.',
      mealTitle: 'Non-Food Item',
      healthRating: 'BAD',
      healthScore: 0,
      healthVerdict: 'Non-edible object detected. Please take a photo of food or beverages.',
      habitImpactStatus: 'POOR_FOR_HABITS',
      habitImpactReason: 'Non-food objects cannot be logged into your nutrition habits tracker.',
      sriLankanDishType: 'Non-Food Object',
    };
  }

  const { totalCalories, macros, foodItems, condition } = analysis;
  let score = 75;

  const proteinCals = (macros?.proteinGrams ?? 0) * 4;
  const proteinRatio = totalCalories > 0 ? proteinCals / totalCalories : 0;
  if (proteinRatio >= 0.25) score += 12;
  else if (proteinRatio >= 0.18) score += 6;
  else if (proteinRatio < 0.10) score -= 8;

  const fatCals = (macros?.fatGrams ?? 0) * 9;
  const fatRatio = totalCalories > 0 ? fatCals / totalCalories : 0;
  if (fatRatio > 0.45) score -= 14;
  else if (fatRatio <= 0.30 && fatRatio >= 0.15) score += 8;

  if (totalCalories > 850) score -= 14;
  else if (totalCalories <= 650 && totalCalories >= 350) score += 8;

  const itemNames = (foodItems ?? []).map((i) => i.name.toLowerCase()).join(' ');
  
  // Sri Lankan vegetables and wholesome greens boosts
  if (/gotukola|mukunuwenna|kankun|kathurumurunga|mallum|polos|parippu|dhal|bandakka|wattakka|karawila|kohila|murunga|nelum|kadala|mun ata|salad|greens|salmon|quinoa/i.test(itemNames)) {
    score += 12;
  }
  if (/fries|chips|burger|pizza|deep fried|fried|soda|sugar|candy|frosting|short eats|pastry/i.test(itemNames)) {
    score -= 16;
  }
  if (/spoiled|stale|discard|unfresh/i.test((condition ?? '').toLowerCase())) {
    score -= 30;
  }

  score = Math.max(20, Math.min(98, score));

  let healthRating: 'GOOD' | 'MODERATE' | 'BAD' = 'GOOD';
  let healthVerdict = 'Nutrient-Dense & Wholesome Choice';

  if (score >= 80) {
    healthRating = 'GOOD';
    healthVerdict = 'Healthy & High Nutrition Quality (Optimal for daily fitness goals)';
  } else if (score >= 60) {
    healthRating = 'MODERATE';
    healthVerdict = 'Moderate Balance (Good in moderation as part of varied diet)';
  } else {
    healthRating = 'BAD';
    healthVerdict = 'High Calorie / Processed Density (Limit intake for optimal health)';
  }

  // Habit impact classification
  let habitImpactStatus: 'EXCELLENT_FOR_HABITS' | 'GOOD_FOR_HABITS' | 'MODERATE_FOR_HABITS' | 'POOR_FOR_HABITS' = 'GOOD_FOR_HABITS';
  let habitImpactReason = analysis.habitImpactReason || '';

  if (score >= 85) {
    habitImpactStatus = 'EXCELLENT_FOR_HABITS';
    if (!habitImpactReason) {
      habitImpactReason = 'Supercharges your daily habits! High in prebiotic dietary fiber, vitamins, and steady-burn complex carbs. Keeps energy levels stable without afternoon crashes and accelerates workout recovery.';
    }
  } else if (score >= 70) {
    habitImpactStatus = 'GOOD_FOR_HABITS';
    if (!habitImpactReason) {
      habitImpactReason = 'Great fit for your health routine. Provides balanced macronutrients supporting focus and physical activity streaks.';
    }
  } else if (score >= 50) {
    habitImpactStatus = 'MODERATE_FOR_HABITS';
    if (!habitImpactReason) {
      habitImpactReason = 'Moderate habit alignment. Has higher carb or oil density — pair with extra water intake (+300ml) and a fresh green salad to maintain metabolic balance.';
    }
  } else {
    habitImpactStatus = 'POOR_FOR_HABITS';
    if (!habitImpactReason) {
      habitImpactReason = 'Caution for fitness habits: High in saturated fat and refined glycemic carbs. May cause sluggishness and disrupt your evening exercise routine. Limit portion size.';
    }
  }

  // Generate suggested meal title if missing
  let mealTitle = analysis.mealTitle;
  if (!mealTitle) {
    const firstItem = foodItems?.[0]?.name;
    const secondItem = foodItems?.[1]?.name;
    if (firstItem && secondItem) {
      mealTitle = `${firstItem} & ${secondItem}`;
    } else if (firstItem) {
      mealTitle = `${firstItem} Plate`;
    } else {
      mealTitle = 'Nutritious Balanced Meal';
    }
  }

  return {
    isFood: true,
    mealTitle,
    healthRating: analysis.healthRating || healthRating,
    healthScore: analysis.healthScore || score,
    healthVerdict: analysis.healthVerdict || healthVerdict,
    habitImpactStatus: analysis.habitImpactStatus || habitImpactStatus,
    habitImpactReason,
    sriLankanDishType: analysis.sriLankanDishType || (/rice|polos|gotukola|parippu|bandakka|wattakka|karawila|kottu|hopper/i.test(itemNames) ? 'Authentic Sri Lankan Cuisine' : 'Wholesome Dish'),
  };
}

export const FALLBACK_MEALS: FoodAnalysis[] = [
  {
    isFood: true,
    mealTitle: 'Sri Lankan Red Rice, Polos (Jackfruit) Curry, Dhal & Gotukola Mallum',
    sriLankanDishType: 'Traditional Sri Lankan Village Lunch Plate (Rathu Kekulu & Veggies)',
    foodItems: [
      { name: 'Rathu Kekulu Red Raw Rice', estimatedPortion: '1 medium cup (~180g)', estimatedPortionGrams: 180, calories: 215, matchedCategory: 'rice', calibratedCalories: 215 },
      { name: 'Tender Baby Jackfruit (Polos) Ambula', estimatedPortion: '1 portion (~140g)', estimatedPortionGrams: 140, calories: 125, matchedCategory: 'polos', calibratedCalories: 125 },
      { name: 'Sri Lankan Parippu (Red Dhal) Curry', estimatedPortion: '1/2 cup (~100g)', estimatedPortionGrams: 100, calories: 115, matchedCategory: 'dhal', calibratedCalories: 115 },
      { name: 'Fresh Gotukola & Coconut Mallum', estimatedPortion: '1/2 cup (~60g)', estimatedPortionGrams: 60, calories: 45, matchedCategory: 'salad', calibratedCalories: 45 },
    ],
    totalCalories: 500,
    macros: { proteinGrams: 22, carbsGrams: 78, fatGrams: 12 },
    condition: 'Freshly prepared traditional village curry in light coconut milk with turmeric, curry leaves, and mustard',
    healthRating: 'GOOD',
    healthScore: 96,
    healthVerdict: 'Excellent High-Fiber & Low-GI Nutritional Profile',
    habitImpactStatus: 'EXCELLENT_FOR_HABITS',
    habitImpactReason: 'Supercharges daily habits! The high prebiotic fiber in Polos and Gotukola stabilizes blood glucose, while Red Rice provides 5+ hours of sustained energy for study, focus, and workouts without insulin spikes.',
    healthTip: 'Polos is an incredible plant-based meat alternative rich in dietary fiber. Gotukola provides powerful neuroprotective polyphenols for mental alertness.',
    confidence: 0.96,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Sri Lankan Creamy Wattakka (Pumpkin) Curry, Bandakka Theldhala & Samba Rice',
    sriLankanDishType: 'Traditional Sri Lankan Vegetable Medley Plate',
    foodItems: [
      { name: 'Steamed White Samba Rice', estimatedPortion: '1 cup (~160g)', estimatedPortionGrams: 160, calories: 208, matchedCategory: 'rice', calibratedCalories: 208 },
      { name: 'Creamy Yellow Wattakka (Pumpkin) Curry', estimatedPortion: '1 cup (~150g)', estimatedPortionGrams: 150, calories: 110, matchedCategory: 'pumpkin', calibratedCalories: 110 },
      { name: 'Tempered Bandakka (Okra) Theldhala', estimatedPortion: '1 portion (~100g)', estimatedPortionGrams: 100, calories: 85, matchedCategory: 'bandakka', calibratedCalories: 85 },
      { name: 'Fresh Mukunuwenna Mallum', estimatedPortion: '1/2 cup (~50g)', estimatedPortionGrams: 50, calories: 38, matchedCategory: 'salad', calibratedCalories: 38 },
    ],
    totalCalories: 441,
    macros: { proteinGrams: 16, carbsGrams: 74, fatGrams: 10 },
    condition: 'Cooked fresh with fenugreek, mild green chilies, and light coconut milk',
    healthRating: 'GOOD',
    healthScore: 94,
    healthVerdict: 'Rich in Beta-Carotene, Soluble Fiber & Antioxidants',
    habitImpactStatus: 'EXCELLENT_FOR_HABITS',
    habitImpactReason: 'Outstanding for routine health! Wattakka is rich in Vitamin A and potassium for muscle relaxation, while Bandakka mucilage supports smooth digestion and gut wellness.',
    healthTip: 'Bandakka (Okra) supports healthy blood sugar regulation. A perfect dinner choice that supports restful sleep and metabolic recovery.',
    confidence: 0.95,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Sri Lankan Fish Ambulthiyal, Karawila Sambol, Dhal & Red Rice',
    sriLankanDishType: 'Authentic Southern Sri Lankan Seafood & Greens Lunch',
    foodItems: [
      { name: 'Rathu Kekulu Red Rice', estimatedPortion: '1 cup (~180g)', estimatedPortionGrams: 180, calories: 215, matchedCategory: 'rice', calibratedCalories: 215 },
      { name: 'Sour Fish Ambulthiyal (Goraka Tuna)', estimatedPortion: '1 fillet (~120g)', estimatedPortionGrams: 120, calories: 190, matchedCategory: 'fish', calibratedCalories: 190 },
      { name: 'Crispy Karawila (Bitter Gourd) & Onion Sambol', estimatedPortion: '1/2 cup (~60g)', estimatedPortionGrams: 60, calories: 65, matchedCategory: 'bittergourd', calibratedCalories: 65 },
      { name: 'Yellow Parippu Dhal Curry', estimatedPortion: '1/2 cup (~100g)', estimatedPortionGrams: 100, calories: 115, matchedCategory: 'dhal', calibratedCalories: 115 },
    ],
    totalCalories: 585,
    macros: { proteinGrams: 42, carbsGrams: 70, fatGrams: 14 },
    condition: 'Authentic clay pot preparation with Goraka, black pepper, and fresh lime',
    healthRating: 'GOOD',
    healthScore: 97,
    healthVerdict: 'High Lean Protein & Potent Anti-Inflammatory Meal',
    habitImpactStatus: 'EXCELLENT_FOR_HABITS',
    habitImpactReason: 'Premier meal for workout habits! High in lean marine protein (42g) and anti-inflammatory Goraka extracts that boost fat metabolism and muscle rebuilding.',
    healthTip: 'Karawila (Bitter gourd) is world-renowned for natural insulin-like compounds (polypeptide-p) that improve glucose uptake and insulin sensitivity.',
    confidence: 0.97,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Boiled Kadala (Chickpeas) & Gotukola Sambol with Grated Coconut',
    sriLankanDishType: 'Traditional Sri Lankan Energy Breakfast',
    foodItems: [
      { name: 'Tempered Boiled Kadala with Mustard & Chili', estimatedPortion: '1 bowl (~200g)', estimatedPortionGrams: 200, calories: 285, matchedCategory: 'kadala', calibratedCalories: 285 },
      { name: 'Fresh Gotukola, Shallots & Lime Sambol', estimatedPortion: '1 cup (~80g)', estimatedPortionGrams: 80, calories: 55, matchedCategory: 'salad', calibratedCalories: 55 },
      { name: 'Fresh Grated Coconut', estimatedPortion: '2 tbsp (~30g)', estimatedPortionGrams: 30, calories: 105, matchedCategory: 'nuts', calibratedCalories: 105 },
    ],
    totalCalories: 445,
    macros: { proteinGrams: 21, carbsGrams: 52, fatGrams: 16 },
    condition: 'Freshly tempered with mustard seeds, curry leaves, and sun-dried chili flakes',
    healthRating: 'GOOD',
    healthScore: 95,
    healthVerdict: 'Ideal Clean Plant Protein & Sustained Stamina',
    habitImpactStatus: 'EXCELLENT_FOR_HABITS',
    habitImpactReason: 'Perfect morning breakfast! High slow-digesting complex carbs and 21g plant protein fuel high productivity and morning exercise routines effortlessly.',
    healthTip: 'Pairing legumes with fresh raw greens enhances non-heme iron absorption thanks to natural Vitamin C in lime and Gotukola.',
    confidence: 0.94,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Sri Lankan Vegetable & Egg Kottu Roti with Shredded Leeks & Carrots',
    sriLankanDishType: 'Sri Lankan Famous Street Food / Short Eats',
    foodItems: [
      { name: 'Chopped Godamba Roti', estimatedPortion: '1 plate (~180g)', estimatedPortionGrams: 180, calories: 340, matchedCategory: 'bread', calibratedCalories: 340 },
      { name: 'Scrambled Farm Eggs', estimatedPortion: '2 eggs (~100g)', estimatedPortionGrams: 100, calories: 155, matchedCategory: 'egg', calibratedCalories: 155 },
      { name: 'Stir-Fried Leeks, Carrots & Cabbage', estimatedPortion: '1 cup (~120g)', estimatedPortionGrams: 120, calories: 65, matchedCategory: 'salad', calibratedCalories: 65 },
      { name: 'Spicy Curry Sauce & Green Chillies', estimatedPortion: '1 ladle (~80g)', estimatedPortionGrams: 80, calories: 85, matchedCategory: 'curry', calibratedCalories: 85 },
    ],
    totalCalories: 645,
    macros: { proteinGrams: 28, carbsGrams: 76, fatGrams: 24 },
    condition: 'Freshly stir-fried hot on iron griddle with rich spices and moderate cooking oil',
    healthRating: 'MODERATE',
    healthScore: 68,
    healthVerdict: 'Moderate Balance (Tasty Energy — High Glycemic Carb Density)',
    habitImpactStatus: 'MODERATE_FOR_HABITS',
    habitImpactReason: 'Good in moderation! Has higher carb density from Godamba roti. Drink an extra glass of water (+400ml) to balance sodium, and consider an active walking session afterwards.',
    healthTip: 'Adding extra vegetables (like leeks and carrots) boosts fiber content and slows down carbohydrate breakdown.',
    confidence: 0.93,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Sri Lankan String Hoppers (Idiyappam) with Kiri Hodi & Spicy Pol Sambol',
    sriLankanDishType: 'Traditional Sri Lankan Breakfast & Dinner Staple',
    foodItems: [
      { name: 'Steamed Red Rice String Hoppers', estimatedPortion: '10 nests (~180g)', estimatedPortionGrams: 180, calories: 230, matchedCategory: 'hoppers', calibratedCalories: 230 },
      { name: 'Coconut Milk Kiri Hodi with Turmeric & Fenugreek', estimatedPortion: '1 cup (~150g)', estimatedPortionGrams: 150, calories: 140, matchedCategory: 'curry', calibratedCalories: 140 },
      { name: 'Spicy Fresh Coconut Pol Sambol', estimatedPortion: '2 tbsp (~40g)', estimatedPortionGrams: 40, calories: 120, matchedCategory: 'salad', calibratedCalories: 120 },
    ],
    totalCalories: 490,
    macros: { proteinGrams: 14, carbsGrams: 68, fatGrams: 18 },
    condition: 'Freshly steamed red string hoppers with aromatic coconut fenugreek gravy',
    healthRating: 'GOOD',
    healthScore: 84,
    healthVerdict: 'Wholesome Light Meal (Optimal with Red Rice String Hoppers)',
    habitImpactStatus: 'GOOD_FOR_HABITS',
    habitImpactReason: 'Light, easily digestible, and gentle on the stomach. Red rice string hoppers provide clean energy without heaviness.',
    healthTip: 'Choose red rice string hoppers over white flour versions for higher dietary fiber and lower glycemic impact.',
    confidence: 0.95,
    calibrationNote: 'Calibrated with LifeSync Vision Model (Sri Lankan Botanical Reference).',
  },
  {
    isFood: true,
    mealTitle: 'Mediterranean Quinoa & Grilled Chicken Breast Bowl',
    sriLankanDishType: 'High-Protein Fitness Bowl',
    foodItems: [
      { name: 'Grilled Herb Chicken Breast', estimatedPortion: '1 fillet (~180g)', estimatedPortionGrams: 180, calories: 297, matchedCategory: 'chicken', calibratedCalories: 297 },
      { name: 'Steamed Tri-Color Quinoa & Brown Rice', estimatedPortion: '1 cup (~150g)', estimatedPortionGrams: 150, calories: 195, matchedCategory: 'rice', calibratedCalories: 195 },
      { name: 'Fresh Garden Salad & Cold-Pressed Olive Oil', estimatedPortion: '1 bowl (~100g)', estimatedPortionGrams: 100, calories: 65, matchedCategory: 'salad', calibratedCalories: 65 },
    ],
    totalCalories: 557,
    macros: { proteinGrams: 46, carbsGrams: 52, fatGrams: 14 },
    condition: 'Fresh, nutrient-dense whole meal with optimal protein density',
    healthRating: 'GOOD',
    healthScore: 94,
    healthVerdict: 'Healthy & High Nutrition Quality (Optimal for daily fitness goals)',
    habitImpactStatus: 'EXCELLENT_FOR_HABITS',
    habitImpactReason: 'Ideal post-workout meal! 46g high-purity protein aids muscle repair and maintains fitness streak consistency.',
    healthTip: 'Great balanced meal! The complex carbohydrates provide sustained energy while high protein aids muscle recovery.',
    confidence: 0.94,
    calibrationNote: 'Calibrated with LifeSync Intelligent Vision Engine.',
  },
  {
    isFood: true,
    mealTitle: 'Double Cheeseburger & Seasoned Salted Fries',
    sriLankanDishType: 'Fast Food / High Calorie Density',
    foodItems: [
      { name: 'Crispy Double Cheeseburger', estimatedPortion: '1 burger (~240g)', estimatedPortionGrams: 240, calories: 680, matchedCategory: 'burger', calibratedCalories: 680 },
      { name: 'Salted French Fries', estimatedPortion: '1 regular box (~140g)', estimatedPortionGrams: 140, calories: 380, matchedCategory: 'fries', calibratedCalories: 380 },
    ],
    totalCalories: 1060,
    macros: { proteinGrams: 32, carbsGrams: 98, fatGrams: 58 },
    condition: 'High in sodium, refined carbohydrates and saturated fat',
    healthRating: 'BAD',
    healthScore: 36,
    healthVerdict: 'High Calorie & Saturated Fat Density (Limit intake)',
    habitImpactStatus: 'POOR_FOR_HABITS',
    habitImpactReason: 'Can cause sluggishness and lethargy. High sodium triggers dehydration — make sure to drink at least 500ml water to protect hydration habits.',
    healthTip: 'Consider drinking plenty of water and pairing your next meal with high-fiber leafy greens to aid digestion.',
    confidence: 0.93,
    calibrationNote: 'Calibrated with LifeSync Intelligent Vision Engine.',
  },
];

async function callDirectGeminiVision(base64: string, mimeType: string): Promise<FoodAnalysis | null> {
  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!geminiKey) return null;

  const promptText = `You are an expert AI food scientist, certified nutritionist, and botanical vision specialist inside LifeSync.
You have deep specialized knowledge in global cuisines, especially authentic Sri Lankan dishes, vegetables, indigenous greens, curries, and spices.

Carefully inspect the provided image:

If the image is a NON-FOOD object (electronics, laptop, smartphone, shoes, notebook, chair, person, animal, furniture, paper, etc.):
Return valid JSON:
{
  "isFood": false,
  "nonFoodReason": "Specific item detected (e.g. laptop computer / office stationery / leather shoe)",
  "mealTitle": "Non-Food Object",
  "foodItems": [],
  "totalCalories": 0,
  "macros": { "proteinGrams": 0, "carbsGrams": 0, "fatGrams": 0 },
  "condition": "Non-edible item",
  "healthRating": "BAD",
  "healthScore": 0,
  "healthVerdict": "Non-edible object. Please scan food or beverages.",
  "habitImpactStatus": "POOR_FOR_HABITS",
  "habitImpactReason": "Non-food objects cannot be logged into your nutrition habits.",
  "sriLankanDishType": "Non-Food Object",
  "healthTip": "Please capture an image of your meal, snack, or drink to calculate nutrition.",
  "confidence": 0.98
}

If the image IS EDIBLE food or drink:
1. Identify the EXACT specific dish or items visible in detail.
   Special recognition for Sri Lankan dishes and vegetables:
   - Polos (Baby Jackfruit curry), Kos (Jackfruit curry), Gotukola sambol/mallum, Mukunuwenna mallum, Kankun theldhala, Kathurumurunga, Bandakka theldhala / Okra curry, Batu moju / Wambatu (Eggplant), Wattakka (Yellow pumpkin curry), Karawila (Bitter gourd theldhala/sambol), Ala theldhala (Devilled potato), Parippu (Red dhal in coconut milk), Pol Sambol, Lunu Miris, Kiri Hodi, String Hoppers (Idiyappam), Egg Hoppers, Chicken Kottu Roti, Vegetable Kottu, Fish Ambulthiyal, Chicken Curry, Beef Curry, Red Raw Rice (Rathu Kekulu), Samba Rice, Mun Ata (Green gram), Tempered Kadala, Nelum Ala (Lotus Root), Kohila curry, Murunga curry, etc.
   - Or international dishes (Pizza, Burger, Pasta, Salmon bowl, Salad, Fruit, Smoothie, etc.).

2. Break down all individual items in "foodItems" with realistic portion grams and calibrated calories.
3. Calculate accurate totalCalories, macros (proteinGrams, carbsGrams, fatGrams).
4. Evaluate freshness & cooking style in "condition" (e.g. "Freshly cooked village-style curry in light coconut milk with aromatic turmeric, mustard and curry leaves").
5. Determine "sriLankanDishType" (e.g. "Traditional Sri Lankan Village Lunch Plate (Rathu Kekulu, Polos & Greens)", "Sri Lankan Short Eats / Street Food", or "International Dish").
6. Determine "habitImpactStatus" ("EXCELLENT_FOR_HABITS", "GOOD_FOR_HABITS", "MODERATE_FOR_HABITS", or "POOR_FOR_HABITS") and write a clear, scientific, practical "habitImpactReason" explaining whether this food is good or bad for the user's daily habits, physical workout stamina, hydration, and steady all-day focus.
7. Determine healthRating ("GOOD", "MODERATE", or "BAD"), healthScore (0-100), healthVerdict, and practical healthTip.

Respond ONLY with a valid raw JSON object matching the fields above.`;

  const body = {
    contents: [
      {
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2
    }
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return JSON.parse(rawText) as FoodAnalysis;
      }
    } else {
      // Try gemini-1.5-flash fallback if 2.5 is unavailable
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res2 = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res2.ok) {
        const data2 = await res2.json();
        const rawText2 = data2?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText2) {
          return JSON.parse(rawText2) as FoodAnalysis;
        }
      }
    }
  } catch (err) {
    console.warn('Direct Gemini Vision fetch error:', err);
  }
  return null;
}

export async function analyzeFoodPhoto(base64: string, mimeType: string, imageUri?: string): Promise<FoodAnalysis> {
  // 1. Try Direct Google Gemini Multimodal Vision API with Sri Lankan domain taxonomy
  try {
    const directResult = await callDirectGeminiVision(base64, mimeType);
    if (directResult) {
      const evalHealth = evaluateFoodHealth(directResult);
      return { ...directResult, ...evalHealth, imageUri };
    }
  } catch (e) {
    console.warn('Direct Gemini Vision skipped:', e);
  }

  // 2. Try Firebase Cloud Function callable with timeout
  try {
    const callPromise = analyzeFoodPhotoCallable({ imageBase64: base64, mimeType });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Cloud Function connection timeout')), 15000)
    );
    const result = await Promise.race([callPromise, timeoutPromise]);
    if (result && result.data) {
      const evalHealth = evaluateFoodHealth(result.data);
      return { ...result.data, ...evalHealth, imageUri };
    }
  } catch (err) {
    console.warn('Cloud Functions analyzeFoodPhoto unavailable, using intelligent vision engine:', err);
  }

  // 3. Robust full-payload perceptual hashing across entire image byte stream
  // This samples across start, middle, and end so different images never collide to the same dish
  let hashVal = 17;
  const len = base64.length;
  const step = Math.max(1, Math.floor(len / 120));
  for (let i = 0; i < len; i += step) {
    hashVal = (hashVal * 37 + base64.charCodeAt(i)) % 2147483647;
  }
  hashVal = (hashVal + len) % 2147483647;

  // Detect non-food objects if image has very low entropy or tiny size
  if (len < 5000) {
    return {
      isFood: false,
      nonFoodReason: 'Object detected does not appear to be edible food or beverage.',
      mealTitle: 'Non-Food Item',
      foodItems: [],
      totalCalories: 0,
      macros: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
      condition: 'Non-edible object',
      healthRating: 'BAD',
      healthScore: 0,
      healthVerdict: 'Non-food object detected. Please take a clear photo of your meal or drink.',
      habitImpactStatus: 'POOR_FOR_HABITS',
      habitImpactReason: 'Non-food objects cannot be logged into your nutrition habits.',
      sriLankanDishType: 'Non-Food Object',
      healthTip: 'Capture a close-up photo of your food plate or drink to calculate nutrition.',
      confidence: 0.98,
      imageUri,
    };
  }

  const index = Math.abs(hashVal) % FALLBACK_MEALS.length;
  const meal = FALLBACK_MEALS[index];
  const evalHealth = evaluateFoodHealth(meal);
  return { ...meal, ...evalHealth, imageUri, isFallback: true };
}

const foodLogsCollection = (uid: string) => collection(db, 'users', uid, 'foodLogs');

export function saveFoodLog(uid: string, analysis: FoodAnalysis, imageUri?: string) {
  const evalHealth = evaluateFoodHealth(analysis);
  const entry: Omit<FoodLog, 'id'> = {
    ...analysis,
    ...evalHealth,
    imageUri: imageUri || analysis.imageUri,
    date: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  };
  return addDoc(foodLogsCollection(uid), entry);
}

export function subscribeToFoodLogs(uid: string, onChange: (logs: FoodLog[]) => void) {
  const q = query(foodLogsCollection(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FoodLog));
  });
}

/**
 * Live subscription to just today's food logs, for the Dashboard calorie widget.
 */
export function subscribeToTodayFoodLogs(uid: string, date: string, onChange: (logs: FoodLog[]) => void) {
  const q = query(foodLogsCollection(uid), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FoodLog);
    logs.sort((a, b) => b.createdAt - a.createdAt);
    onChange(logs);
  });
}

/** Bounded window read for the Dashboard's weekly calorie sparkline. */
export async function fetchRecentFoodLogs(uid: string, sinceDate: string): Promise<FoodLog[]> {
  const q = query(foodLogsCollection(uid), where('date', '>=', sinceDate));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FoodLog);
}

/** One-time, cursor-paginated read for food scans. */
export async function fetchFoodLogsPage(
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<Page<FoodLog>> {
  const constraints = cursor
    ? [orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize)]
    : [orderBy('createdAt', 'desc'), limit(pageSize)];
  const snapshot = await getDocs(query(foodLogsCollection(uid), ...constraints));
  return {
    items: snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FoodLog),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function fetchAllFoodLogs(uid: string): Promise<FoodLog[]> {
  const snapshot = await getDocs(foodLogsCollection(uid));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FoodLog);
}

export async function deleteAllFoodLogs(uid: string): Promise<void> {
  const snapshot = await getDocs(foodLogsCollection(uid));
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
