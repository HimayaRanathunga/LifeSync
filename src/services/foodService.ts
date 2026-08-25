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
import { toDateKey } from '../utils/dates';

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

/**
 * Coerces a model response into the shape the rest of the app relies on.
 *
 * The prompt asks for a fixed JSON schema, but a language model can still omit a field, return a
 * number as a string, or emit foodItems as bare strings instead of objects. Every consumer
 * downstream (evaluateFoodHealth, the scan screen, the Firestore write) assumed the schema was
 * honoured, so a single missing `name` threw and discarded an otherwise-good analysis.
 */
function normalizeAnalysis(raw: any): FoodAnalysis {
  const num = (v: any, fallback = 0): number => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  };

  const items = Array.isArray(raw?.foodItems) ? raw.foodItems : [];

  return {
    ...raw,
    isFood: raw?.isFood !== false,
    mealTitle: typeof raw?.mealTitle === 'string' ? raw.mealTitle : '',
    foodItems: items.map((it: any) => {
      // Some responses give a plain string per item rather than the object the schema asks for.
      if (typeof it === 'string') {
        return { name: it, estimatedPortion: '', estimatedPortionGrams: 0, calories: 0 };
      }
      return {
        ...it,
        name: typeof it?.name === 'string' && it.name.trim() ? it.name : 'Unidentified item',
        estimatedPortion: typeof it?.estimatedPortion === 'string' ? it.estimatedPortion : '',
        estimatedPortionGrams: num(it?.estimatedPortionGrams),
        calories: num(it?.calories),
      };
    }),
    totalCalories: num(raw?.totalCalories),
    macros: {
      proteinGrams: num(raw?.macros?.proteinGrams),
      carbsGrams: num(raw?.macros?.carbsGrams),
      fatGrams: num(raw?.macros?.fatGrams),
    },
    condition: typeof raw?.condition === 'string' ? raw.condition : '',
    healthTip: typeof raw?.healthTip === 'string' ? raw.healthTip : '',
    confidence: num(raw?.confidence, 0),
  } as FoodAnalysis;
}

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

  // `?? ''` on the name too: these objects come from a language model, which occasionally omits
  // a field even when the response schema asks for it. An undefined name previously threw
  // "Cannot read property 'toLowerCase' of undefined" and lost the entire analysis.
  const itemNames = (foodItems ?? []).map((i) => (i?.name ?? '').toLowerCase()).join(' ');
  
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


async function callDirectGeminiVision(base64: string, mimeType: string): Promise<FoodAnalysis | null> {
  // Previously fell back to EXPO_PUBLIC_FIREBASE_API_KEY, which is not a Gemini credential — that
  // sent a request guaranteed to 400 instead of cleanly reporting "no key configured".
  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
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

  /**
   * Model order matters. gemini-2.5-flash was retired for new API keys — it now returns
   * 404 "no longer available to new users" — so the current model is tried first and older
   * names are kept only as fallbacks for keys provisioned before the cutover.
   */
  const MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[gemini] ${model} -> HTTP ${res.status}`, detail.slice(0, 200));
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        console.warn(`[gemini] ${model} returned no text part`);
        continue;
      }

      // The model is asked for raw JSON, but wrapping it in a ```json fence is a common
      // deviation — strip that before parsing rather than failing the whole scan.
      const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try {
        return normalizeAnalysis(JSON.parse(cleaned));
      } catch {
        console.warn(`[gemini] ${model} returned unparseable JSON:`, cleaned.slice(0, 200));
        continue;
      }
    } catch (err) {
      console.warn(`[gemini] ${model} request failed:`, err);
    }
  }

  // Every model was tried and none produced usable JSON — the caller falls through to the
  // Cloud Function, then to the clearly-labelled example meal.
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

  // 2. Try the Firebase Cloud Function callable. This is the production path — the one where the
  //    Gemini key lives server-side — but it only exists once `firebase deploy` has been run, so
  //    the timeout keeps an undeployed project from stalling the whole scan.
  try {
    const callPromise = analyzeFoodPhotoCallable({ imageBase64: base64, mimeType });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Cloud Function connection timeout')), 8000)
    );
    const result = await Promise.race([callPromise, timeoutPromise]);
    if (result && result.data) {
      const evalHealth = evaluateFoodHealth(result.data);
      return { ...result.data, ...evalHealth, imageUri };
    }
  } catch (err) {
    console.warn('[food] Cloud Function analyzeFoodPhoto unavailable:', err);
  }

  // Every analysis path failed. Previously this fell through to a meal picked by hashing the
  // image bytes — a fabricated result presented alongside the user's own photo. Throwing instead
  // lets FoodScanScreen surface a real error, which is the only honest outcome when the photo
  // was never actually analysed.
  throw new Error(
    'Could not analyse this photo. Check your connection and try again — if it keeps failing, ' +
      'the AI service may be unavailable right now.'
  );
}

const foodLogsCollection = (uid: string) => collection(db, 'users', uid, 'foodLogs');

/**
 * Firestore rejects `undefined` field values outright — a single optional property that happens
 * to be unset makes the whole addDoc throw. Several fields here are optional by design
 * (imageUri, matchedCategory, calibratedCalories, nonFoodReason), so strip them rather than
 * letting one absent value lose the user's meal.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export function saveFoodLog(uid: string, analysis: FoodAnalysis, imageUri?: string) {
  const evalHealth = evaluateFoodHealth(analysis);
  const entry: Omit<FoodLog, 'id'> = {
    ...analysis,
    ...evalHealth,
    // Note: this is the on-device file:// URI from the image picker, not an uploaded image.
    // It renders on the phone that took the photo and nowhere else — showing the meal's photo
    // on another device would need the file uploaded to Firebase Storage first.
    imageUri: imageUri || analysis.imageUri,
    date: toDateKey(),
    createdAt: Date.now(),
  };
  return addDoc(foodLogsCollection(uid), stripUndefined(entry));
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
