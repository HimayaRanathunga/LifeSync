import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { matchFoodCategory } from './nutritionReference';
import { toFeatureVector } from './calorieSyntheticData';
import { predict } from '../ml/linearRegression';
import { calorieModel } from './model/calorieWeights.generated';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Verified against the installed @google/genai@2.17.1 SDK's own README quickstart example.
// If Google deprecates this model, swap the string here — check
// https://ai.google.dev/gemini-api/docs/models for the current vision-capable "flash" tier.
const FOOD_ANALYSIS_MODEL = 'gemini-2.5-flash';

const FOOD_ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    isFood: {
      type: Type.BOOLEAN,
      description: 'True if the image contains edible food or beverages, false if it is a non-food object, document, electronic device, furniture, animal, or person.',
    },
    nonFoodReason: {
      type: Type.STRING,
      description: 'Explanation if the image is NOT food (e.g. "Electronic device/smartphone detected").',
    },
    mealTitle: {
      type: Type.STRING,
      description: 'A catchy, descriptive suggested name for this meal (e.g. "Mediterranean Grilled Chicken Bowl").',
    },
    foodItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          estimatedPortion: { type: Type.STRING, description: 'e.g. "1 medium bowl (~250g)"' },
          estimatedPortionGrams: { type: Type.NUMBER, description: 'Numeric estimate of the portion weight in grams.' },
          calories: { type: Type.NUMBER },
        },
        required: ['name', 'estimatedPortion', 'estimatedPortionGrams', 'calories'],
      },
    },
    totalCalories: { type: Type.NUMBER },
    macros: {
      type: Type.OBJECT,
      properties: {
        proteinGrams: { type: Type.NUMBER },
        carbsGrams: { type: Type.NUMBER },
        fatGrams: { type: Type.NUMBER },
      },
      required: ['proteinGrams', 'carbsGrams', 'fatGrams'],
    },
    condition: {
      type: Type.STRING,
      description: 'Freshness/quality assessment, e.g. "fresh", "slightly overripe", "appears spoiled — discard"',
    },
    healthRating: {
      type: Type.STRING,
      description: 'Predicted nutrition classification: "GOOD", "MODERATE", or "BAD".',
    },
    healthScore: {
      type: Type.NUMBER,
      description: 'Health & nutrition score from 0 to 100.',
    },
    healthVerdict: {
      type: Type.STRING,
      description: 'Short verdict e.g. "Healthy & wholesome choice" or "High calorie density / Limit intake".',
    },
    habitImpactStatus: {
      type: Type.STRING,
      description: 'Predicted habit impact: "EXCELLENT_FOR_HABITS", "GOOD_FOR_HABITS", "MODERATE_FOR_HABITS", or "POOR_FOR_HABITS".',
    },
    habitImpactReason: {
      type: Type.STRING,
      description: 'Detailed explanation of how this meal impacts daily energy habits, workout stamina, hydration, digestion, and focus.',
    },
    sriLankanDishType: {
      type: Type.STRING,
      description: 'Classification if Sri Lankan cuisine (e.g. "Traditional Rice & Veggie Curries", "Greens & Sambol", "Short Eats / Kottu", or "International Cuisine").',
    },
    healthTip: { type: Type.STRING, description: 'One short, practical, encouraging tip related to this meal.' },
    confidence: { type: Type.NUMBER, description: '0-1 confidence in this analysis overall.' },
  },
  required: ['isFood', 'foodItems', 'totalCalories', 'macros', 'condition', 'healthTip', 'confidence'],
};

const ANALYSIS_PROMPT = `You are an expert AI nutrition and food vision scientist inside LifeSync, with deep specialization in global cuisine and authentic Sri Lankan foods, vegetables, greens, and traditional curries. \
First, verify if this photo depicts edible food or drink. If non-food (laptop, shoes, paper, furniture, person), set "isFood": false, provide "nonFoodReason", set totalCalories to 0 and empty foodItems. \
If the photo IS food or drink: \
1. Carefully identify the REAL-WORLD authentic meal name (e.g., "Sri Lankan Red Rice with Polos Curry, Dhal Parippu & Gotukola Mallum", "Bandakka Theldhala & Chicken Curry", "String Hoppers with Kiri Hodi & Lunu Miris", "Vegetable Kottu Roti", "Pol Sambol & Boiled Sweet Potato"). Pay special attention to Sri Lankan vegetables: Polos (jackfruit), Gotukola/Mukunuwenna/Kankun/Kathurumurunga mallum, Parippu (dhal), Bandakka (okra), Batu moju (eggplant), Wattakka (pumpkin), Karawila (bitter gourd), Ala theldhala (devilled potato), Murunga (drumstick), Kohila, Nelum ala (lotus root), Pathola (snake gourd), etc. \
2. Provide a full per-item breakdown in "foodItems" with realistic portion grams and calibrated calories. \
3. Calculate accurate totalCalories, macros (proteinGrams, carbsGrams, fatGrams). \
4. Evaluate cooking style and freshness in "condition" (e.g. "Freshly cooked village-style curry in light coconut milk with aromatic turmeric and curry leaves"). \
5. Determine "habitImpactStatus" ("EXCELLENT_FOR_HABITS", "GOOD_FOR_HABITS", "MODERATE_FOR_HABITS", or "POOR_FOR_HABITS") and a thorough "habitImpactReason" explaining how this meal impacts daily wellness habits, sustained physical energy, workout recovery, and hydration. \
6. Provide healthRating ("GOOD", "MODERATE", or "BAD"), healthScore (0-100), healthVerdict, and an actionable healthTip.`;

export interface AnalyzeFoodRequest {
  imageBase64: string;
  mimeType?: string;
}

interface FoodItemRaw {
  name: string;
  estimatedPortion: string;
  estimatedPortionGrams: number;
  calories: number;
  matchedCategory?: string;
  calibratedCalories?: number;
}

interface FoodAnalysisRaw {
  isFood?: boolean;
  nonFoodReason?: string;
  mealTitle?: string;
  foodItems: FoodItemRaw[];
  totalCalories: number;
  macros: { proteinGrams: number; carbsGrams: number; fatGrams: number };
  condition: string;
  healthRating?: 'GOOD' | 'MODERATE' | 'BAD';
  healthScore?: number;
  healthVerdict?: string;
  healthTip: string;
  confidence: number;
  calibrationNote?: string;
  calibrationAvgDiffPct?: number;
}

/**
 * Cross-checks Gemini's per-item calorie estimate against the trained calorie calibration model
 * (functions/src/ml/linearRegression.ts, trained on synthetic data built around
 * nutritionReference.ts — see functions/src/food/trainCalorieModel.ts). Only calibrates items
 * whose name confidently matches a reference category — no forced nearest-match fallback, since a
 * wrong forced match would inject a confidently-wrong signal. Stays silent (no calibrationNote)
 * when nothing matched, rather than implying calibration happened when it didn't.
 */
function calibrateFoodAnalysis(analysis: FoodAnalysisRaw): FoodAnalysisRaw {
  let matchedCount = 0;
  let totalRelativeDiff = 0;

  const foodItems = analysis.foodItems.map((item) => {
    const category = matchFoodCategory(item.name);
    if (!category) return item;

    const vector = toFeatureVector(item.estimatedPortionGrams, category.category);
    const calibratedCalories = Math.max(0, predict(calorieModel, vector));

    matchedCount += 1;
    totalRelativeDiff += Math.abs(calibratedCalories - item.calories) / Math.max(item.calories, 1);

    return { ...item, matchedCategory: category.category, calibratedCalories: Math.round(calibratedCalories) };
  });

  if (matchedCount === 0) {
    return { ...analysis, foodItems };
  }

  const avgDiffPct = Math.round((totalRelativeDiff / matchedCount) * 100);
  const calibrationNote =
    avgDiffPct <= 15
      ? `Cross-checked ${matchedCount}/${foodItems.length} item(s) against nutrition reference data — estimates align within ${avgDiffPct}%.`
      : `Cross-checked ${matchedCount}/${foodItems.length} item(s) against nutrition reference data — estimates diverge by ~${avgDiffPct}%, treat with extra caution.`;

  return { ...analysis, foodItems, calibrationNote, calibrationAvgDiffPct: avgDiffPct };
}

export const analyzeFoodPhoto = onCall({ secrets: [geminiApiKey] }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { imageBase64, mimeType } = (request.data ?? {}) as Partial<AnalyzeFoodRequest>;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'imageBase64 is required.');
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });

  const response = await ai.models.generateContent({
    model: FOOD_ANALYSIS_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: ANALYSIS_PROMPT }, { inlineData: { mimeType: mimeType ?? 'image/jpeg', data: imageBase64 } }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_ANALYSIS_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new HttpsError('internal', 'The AI model returned an empty response.');
  }

  let analysis: FoodAnalysisRaw;
  try {
    analysis = JSON.parse(text);
  } catch {
    throw new HttpsError('internal', 'The AI model returned a response that could not be parsed as JSON.');
  }

  return calibrateFoodAnalysis(analysis);
});
