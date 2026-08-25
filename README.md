# LifeSync

AI-Driven Smart Lifestyle Companion — CMP7003 PRAC1 project. React Native (Expo) + Firebase.

## Setup

1. `npm install`
2. Create a Firebase project at https://console.firebase.google.com, enable **Authentication (Email/Password)**, **Firestore**, **Cloud Functions** (Blaze plan required for scheduled functions and for calling external APIs like Gemini), and **Cloud Messaging**.
3. Copy `.env.example` to `.env` and fill in the Firebase web app config values (Project Settings → General → Your apps).
4. Get a free Gemini API key from https://aistudio.google.com/apikey and set it as a Cloud Functions secret (server-side only — see "Food photo analysis" below).
5. `npx expo start` and open in Expo Go or a simulator.

## Project structure

```
src/
  config/firebase.ts       Firebase init, reads from .env
  context/AuthContext.tsx  auth state provider
  navigation/               RootNavigator (auth-gated) + MainTabs
  screens/                  auth, onboarding, dashboard, habits, food, health, settings
  services/                 Firestore read/write helpers, notifications, image prep
  types/                    shared TypeScript types
functions/                 Firebase Cloud Functions — AI recommendation engine + food analysis
  src/ml/                   trained ML model (see below)
  src/food/                 Gemini vision food-analysis callable function
firestore.rules            per-user data isolation security rules
docs/testing/               functional test table, ML evaluation writeup, SUS questionnaire
```

## AI recommendation engine

Hybrid design: `functions/src/recommendationEngine.ts` is a transparent, recency-decayed
weighted-average heuristic used for cold-start habits (<5 logged completions — not enough data
for the trained model to be reliable). Once a habit has ≥5 logs, `functions/src/ml/mlRecommender.ts`
takes over: a logistic regression model (`functions/src/ml/logisticRegression.ts`, dependency-free,
gradient-descent trained — no TensorFlow, to keep Cloud Functions deployment simple) pre-trained
on a synthetic population (`functions/src/ml/syntheticData.ts`) to solve cold start, currently at
68.0% validation accuracy vs. 65.0% majority-class baseline. To retrain: `cd functions && npm run train`
(regenerates `functions/src/ml/model/weights.generated.ts`, which compiles straight into the deployed
function — no separate asset-loading step).

`functions/src/index.ts` wires the recommender up as:
- `recomputeRecommendationsDaily` — scheduled Cloud Function, runs daily at 03:00
- `recomputeMyRecommendations` — callable function the app can trigger on demand (useful for demos)

The app re-syncs local push notifications (`src/services/notificationsService.ts`) to the latest
recommended times every time recommendations update — reminders adapt automatically as the model
learns.

## Food photo analysis

`functions/src/food/analyzeFoodPhoto.ts` is a callable Cloud Function that sends a compressed
food photo to Google's Gemini vision model (`@google/genai`) with a structured JSON response
schema, returning identified food items, calorie/macro estimates, a freshness/condition
assessment, and a health tip. The client (`src/screens/food/FoodScanScreen.tsx`) captures/picks
a photo, resizes+compresses it client-side (`src/services/imageUtils.ts`, via
`expo-image-manipulator`) before upload, and saves the result to `users/{uid}/foodLogs`.

**The Gemini API key is never exposed to the client** — it's read server-side only, via a Firebase
Functions v2 secret:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

(paste your https://aistudio.google.com/apikey key when prompted — requires `firebase login` first).

## Deploying

```bash
cd functions
npm install
firebase deploy --only functions,firestore:rules
```

(requires `firebase login` and `firebase use --add` to link your project first).

## Local testing without deploying

`firebase emulators:start` runs Auth/Firestore/Functions locally — point the app at the
emulator during development to test the security rules and recommendation engine for free.

### Firestore security rules tests

`firestore-tests/` is a standalone test project (own `package.json`) that runs `firestore.rules`
against the local emulator via `@firebase/rules-unit-testing`, checking unauthenticated denial,
per-user isolation, and that `recommendations` is client-read-only. Run it with:

```bash
cd firestore-tests && npm install
npx firebase-tools emulators:start --only firestore --project demo-lifesync
# in a second terminal, once the emulator says "All emulators ready":
cd firestore-tests && npm test
```

No `firebase login` or real project needed — `demo-lifesync` is a placeholder ID Firebase
recommends for emulator-only testing. First run downloads the emulator binary (~130MB), so needs
a decent connection once.

## Next steps

- Testing & Evaluation: Firestore rules tests now run for real (11/11 passing) and a functional
  test table, ML evaluation writeup, and SUS questionnaire template live in `docs/testing/` —
  see `PLAN.md`'s "Testing & Evaluation pass" section. Still needed: run the functional test
  table by hand in the app, and get real SUS responses from 3–5 peers.
- System diagrams + the 3000-word report (see `PLAN.md` for the rubric-mapped checklist).
