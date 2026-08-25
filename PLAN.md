# LifeSync Build Plan (target: ~90/100, CMP7003 PRAC1)

Source brief: `../cmp-7003prac-01.docx`. Full original plan: see conversation / `me-folder-eke-thiyena-magical-platypus` plan file. This is the living, in-repo checklist — update it as work lands.

## Rubric-to-feature mapping & status

| Criterion | Marks | Covered by | Status |
|---|---|---|---|
| Project Content & Innovation | 20 | AI habit recommender (trained ML) + context-awareness + adaptive notifications + AI food-photo calorie/condition analysis | 🟢 all core smart features done |
| Application of Theory & Literature | 10 | Report citations (context-aware computing, recommender systems, Nielsen heuristics, OWASP MASVS, MVVM, Agile, supervised learning/logistic regression, multimodal/vision LLMs) | ⬜ report not started |
| Technical Implementation | 20 | Firebase Auth+Firestore+Cloud Functions, sensors, CRUD, clean modular code, trained ML model, Gemini vision API integration | 🟢 core + sensors + ML + vision AI done |
| UI/UX Design | 10 | Consistent design system, nav, accessibility | 🟢 theme system + tab icons + a11y labels/roles + verified WCAG AA contrast done |
| System Architecture | 10 | Architecture/use-case/schema diagrams for report | ⬜ diagrams not created |
| Security, Performance, Scalability | 10 | Firestore rules, pagination, offline persistence | 🟢 rules + tests written (tests not run — see below); pagination done on habit/health/food history |
| Testing & Evaluation | 10 | Functional test table, SUS usability test, emulator rule tests | 🟡 rules tests run for real (11/11 pass) + functional test table + ML evaluation done; SUS needs real peer responses |
| Report Quality | 5 | 3000-word report | ⬜ not started |
| Referencing | 5 | Harvard references | ⬜ not started |

Legend: 🟢 done 🟡 in progress ⬜ not started

## Step-by-step build order (what's next)

1. ~~Project scaffold — Expo/TS, navigation, Firebase config, Firestore service layer~~ ✅
2. ~~AI recommendation engine — weighted scoring Cloud Function (rule-based baseline)~~ ✅
3. ~~Firestore security rules — per-user isolation~~ ✅ (written, not yet deployed)
4. ~~Context-awareness — weather API integration~~ ✅
5. ~~ML upgrade — trained logistic regression model (see functions/src/ml/), hybrid with rule-based fallback for cold start~~ ✅
6. ~~Adaptive notifications — expo-notifications wired to recommended times (src/services/notificationsService.ts, re-synced from Dashboard whenever recommendations change)~~ ✅
7. ~~Food photo calorie/nutrition/condition detection — Gemini vision API via Cloud Function (functions/src/food/analyzeFoodPhoto.ts), Food tab in the app (src/screens/food/FoodScanScreen.tsx)~~ ✅
8. ~~Firestore rules tests written and run (firestore-tests/rules.test.ts) — unauthenticated denial, owner read/write, cross-user isolation, recommendations server-write-only~~ ✅ (11/11 passing against the real Firestore Emulator — see note below)
9. ~~UI/UX polish pass — shared theme system (src/theme/theme.ts), reusable Button/Card/TextField components, tab bar icons, safe-area handling, accessibility labels/roles, verified WCAG AA color contrast~~ ✅
10. ~~Branding pass — LS logo wired in as app icon/adaptive icon/splash/favicon + in-app Logo component, brand gradient system sampled from the logo, tinted screen backgrounds~~ ✅
11. ~~Pagination on habit/health/food history lists (src/hooks/usePaginatedList.ts, cursor-based Firestore reads, "Load more" UI on all three)~~ ✅
12. ~~Testing — Firestore rules emulator tests run for real (11/11 pass), functional test table (docs/testing/functional-test-table.md), ML validation-accuracy writeup (docs/testing/ml-evaluation.md), SUS questionnaire template (docs/testing/sus-questionnaire.md)~~ 🟡 (SUS still needs real peer responses, functional test table still needs manual run-through — see note below) ← next: finish these two, then diagrams
13. **System diagrams for report — architecture, use case, Firestore schema, data-flow, ML pipeline**
14. **3000-word report — write using Report Structure section of the brief**

## Food photo analysis (functions/src/food/, src/screens/food/)

- `functions/src/food/analyzeFoodPhoto.ts` — callable Cloud Function, sends the photo to Gemini
  (`@google/genai`, model `gemini-2.5-flash` — verified against the installed SDK's own README,
  not guessed) with a structured `responseSchema` so the model returns clean JSON: food items
  (name/portion/calories), total calories, macros, freshness/condition assessment, a health tip,
  and a confidence score
- API key is a **Cloud Functions v2 secret** (`GEMINI_API_KEY`, via `defineSecret`), never sent to
  or stored in the client — set it with `firebase functions:secrets:set GEMINI_API_KEY` (student
  must run this themselves after `firebase login`)
- Client: `src/screens/food/FoodScanScreen.tsx` — camera/library picker → resize+compress via
  `expo-image-manipulator` (`src/services/imageUtils.ts`, capped to 1024px width to keep the
  callable-function payload small) → `src/services/foodService.ts` calls the function and saves
  the result to `users/{uid}/foodLogs`
- Food-log history is now shown in-app ("Recent scans" section on the Food tab, paginated — see below)

## Firestore rules tests (firestore-tests/)

Standalone Node/Jest project (separate `package.json`, not part of the app or `functions/`)
using `@firebase/rules-unit-testing` against a local Firestore emulator. Covers: unauthenticated
access denied everywhere; an owner can read/write their own profile/habits/healthLogs/foodLogs;
cross-user reads/writes/deletes are denied; the `recommendations` subcollection is readable by
its owner but not client-writable (only the Cloud Function's Admin SDK, which bypasses rules,
may write it).

**Status: executed for real, 2026-08-18 — 11/11 tests passing.** The earlier note here said the
emulator couldn't start due to slow network access to `storage.googleapis.com`; that turned out
to be stale (a same-day retry the day before had already downloaded it fine) — the real blocker
this run was that Java wasn't on `PATH` in the shell (`spawn java ENOENT`), even though a JDK is
installed at `C:\Program Files\Java\jdk-21.0.10`. Once Java's `bin` dir was added to `PATH` for
the emulator process, `firebase emulators:start --only firestore --project demo-lifesync` came
up cleanly and every test passed:

```
PASS ./rules.test.ts
  unauthenticated access
    √ cannot read another user profile
    √ cannot write a habit
  owner access to their own data
    √ can read and write their own profile
    √ can create, read, and delete their own habit
    √ can write their own health log and food log
  cross-user isolation
    √ cannot read another user profile
    √ cannot read another user habit
    √ cannot write another user habit
    √ cannot delete another user food log
  recommendations subcollection is server-write-only
    √ owner can read a recommendation seeded by the (trusted, Admin SDK) Cloud Function
    √ owner cannot write their own recommendation directly from the client

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

To re-run:
```bash
cd firestore-tests && npm install   # already done, node_modules present
npx firebase-tools emulators:start --only firestore --project demo-lifesync
# in a second terminal, once "All emulators ready" appears:
cd firestore-tests && npm test
```
If you see `spawn java ENOENT`, put a JDK's `bin` directory on `PATH` for that shell first (a
JDK is already installed on this machine at `C:\Program Files\Java\jdk-21.0.10\bin`).

## ML model (functions/src/ml/)

- `logisticRegression.ts` — dependency-free logistic regression (mini-batch gradient descent, L2 reg)
- `syntheticData.ts` — synthetic training data generator (solves cold-start; 250 simulated users × 30 days)
- `historicalRate.ts` — shared recency+hour-kernel-weighted success rate (used identically in training and live inference — avoids train/serve skew)
- `features.ts` — shared feature engineering (7 features: hour as sin/cos, weekend, historical success rate, sleep, streak, habit age)
- `train.ts` — run via `npm run train` inside `functions/`; writes `model/weights.generated.ts` (compiles straight into the deployed function, no asset-loading step)
- `mlRecommender.ts` — live inference, scans candidate hours 6:00–22:00, returns highest-probability slot
- Hybrid design: habits with <5 logged completions fall back to the transparent rule-based `recommendationEngine.ts` (cold start); ≥5 logs uses the trained model
- Current trained model: 68.0% validation accuracy vs 65.0% majority-class baseline, dominant learned feature is `historicalSuccessRate` (weight 0.386) — write this comparison into the report's Evaluation section as evidence of genuine (if modest, honestly-reported) predictive lift
- To retrain: `cd functions && npm run train` (regenerates `weights.generated.ts`)

## UI/UX polish pass (src/theme/, src/components/)

- `src/theme/theme.ts` — single source of design tokens (colors, spacing, radius, typography).
  Every color pair actually used for text-on-background was checked with a real WCAG
  relative-luminance contrast calculation (not eyeballed) — this caught and fixed two colors
  that would have failed AA (`success` at 3.14:1, `textMuted` at 3.93:1); final palette is
  documented with verified ratios in code comments, all ≥4.5:1 for normal text.
- `src/components/Button.tsx`, `Card.tsx`, `TextField.tsx` — reusable primitives every screen
  now uses instead of one-off inline styles, so the app reads as one consistent system. All
  interactive elements have `accessibilityRole`/`accessibilityLabel`/`accessibilityState`, and
  touch targets are ≥44pt (WCAG 2.5.5).
- Tab bar now has icons (`@expo/vector-icons` Ionicons) with active/inactive theme-based tint,
  plus a proper "Food Scan" title instead of the raw route name.
- `SafeAreaProvider` wired at the App.tsx root; every screen uses `useSafeAreaInsets()` for its
  top/bottom padding instead of assuming no notch/status-bar — this was previously missing
  everywhere and would have visually broken on notched devices.
- Verified with `grep` after the pass: zero hardcoded hex colors remain in `src/screens/`.

## Branding pass (assets/, src/theme/theme.ts, src/components/Logo.tsx)

- Source logo provided by the student (`C:\Users\himay\Downloads\logo_1.png`, transparent-
  background "LS" monogram with a leaf accent) generated all app-facing icon/splash assets from
  it via composited/resized PNGs: `icon.png` (opaque white bg), `android-icon-foreground.png`
  (transparent, adaptive-icon safe zone), `android-icon-background.png` (flat tint),
  `android-icon-monochrome.png` (white silhouette derived from the logo's alpha channel, for
  Android 13+ themed icons), `favicon.png`, `splash-icon.png`, and a full-res `logo.png` copy
  for in-app use.
- `expo-splash-screen` installed and configured via the `app.json` plugin (image + background
  color) — was completely unconfigured before, would have shown a blank white splash.
- `expo-linear-gradient` installed; `theme.ts` now exports a `gradients` object (hero/accent/
  leaf) built from colors sampled directly from the logo's own gradient sweeps (verified with
  actual pixel sampling, not guessed).
- **Caught and fixed a real accessibility bug during this pass**: the first version of the
  brand gradient colors (sampled straight from the vivid logo) failed WCAG contrast badly when
  used as a background behind white text (as low as 2.43:1, need 4.5:1) — cyan and green in
  particular. Fixed by introducing separate, independently-verified "*Text" darkened variants
  (`brandCyanText`, `brandMagentaText`, `brandLeafText`, all ≥4.5:1 vs white) used for every
  gradient that carries text, while keeping the original vivid tones available for text-free
  decorative use only. This is the second time a contrast bug was caught by actually computing
  ratios instead of eyeballing hex values (see the earlier `success`/`textMuted` fix) — worth
  re-verifying contrast any time a new color is introduced, not just once at theme setup.
- `Logo` component (`src/components/Logo.tsx`) used in gradient hero headers on Login, Signup,
  Onboarding, Dashboard, and Settings. Screen backgrounds across the app shifted from flat white
  to a soft tinted `colors.surface`, with cards using the new `Card` `elevated` variant (white +
  shadow) so they still visually pop off the tinted canvas.

## Pagination (src/hooks/usePaginatedList.ts, src/services/logsService.ts, foodService.ts)

- Real problem being solved: habit completion logs, health logs, and food scan logs all grow
  unbounded over months of use. The original `subscribeToHabitLogs`/`subscribeToHealthLogs`/
  `subscribeToFoodLogs` were live `onSnapshot` listeners with no `limit()` — every screen open
  would load and keep syncing the *entire* history. This is exactly the "performance
  optimisation... efficient resource management" the rubric asks for, and it was a real gap
  before this pass, not just a checkbox.
- Design: one-time, cursor-paginated reads (`fetchHabitLogsPage`/`fetchHealthLogsPage`/
  `fetchFoodLogsPage`, `limit()` + `startAfter()` + `getDocs()`), not live subscriptions — a
  history list doesn't need realtime updates the way today's recommendations do. A shared
  `usePaginatedList` hook (`src/hooks/usePaginatedList.ts`) drives all three so the pagination
  state machine (items/cursor/hasMore/loading) isn't duplicated three times.
- **Health tab**: FlatList with the existing form as `ListHeaderComponent`, paginated "Recent
  logs" as the list body, "Load more" footer; refreshes after saving a new entry.
- **Food tab**: "Recent scans" section appended below the scan/result UI, refreshes after saving.
- **Habits tab**: tapping a habit now opens a new `HabitHistoryScreen` (added to the Habits stack)
  showing that habit's paginated completion history.
- **Bug caught before shipping**: the first draft of `HabitHistoryScreen` fetched a generic page
  of *all* habit logs and filtered to one `habitId` client-side — this desyncs the pagination
  cursor from what "hasMore" means (a full raw page can filter down to zero matches, or a
  seemingly-exhausted page can still have more matches beyond it). Fixed by adding a proper
  `where('habitId', '==', habitId)` server-side filter to `fetchHabitLogsPage` instead.

## Testing & Evaluation pass (docs/testing/)

- **Firestore rules tests**: actually executed against the real emulator, 11/11 passing — see
  the updated "Firestore rules tests" section above for the full run and the `spawn java ENOENT`
  fix (Java was installed but not on `PATH`).
- `docs/testing/functional-test-table.md` — 27 manual functional test cases (F01–F27) covering
  every screen: auth, onboarding, dashboard/recommendations, habits (add/edit/complete/delete/
  history/pagination), health logging + pagination, food scan (capture → analyze → save →
  pagination, including a bad-photo case), adaptive notifications, weather context-awareness,
  settings, cross-user isolation spot-check, accessibility, offline resilience. Expected results
  are pre-filled; Actual Result/Status columns are intentionally left blank — the assistant can't
  drive the real Expo app UI, so **the student needs to run through this table by hand** before
  it's usable as evidence in the report.
- `docs/testing/ml-evaluation.md` — full methodology + results writeup for the trained model.
  Verified numbers, not assumed: currently-deployed model is 67.1% validation accuracy (69.9%
  train) per `functions/src/ml/model/weights.generated.ts`; re-checked that same model against
  three fresh synthetic validation draws and it beat the majority-class baseline by +2.3 to +2.8
  points every time, confirming the lift isn't a lucky split. Includes feature-weight
  interpretation (dominant feature is `historicalSuccessRate`, 0.386). Ready to paste into the
  report's Evaluation section.
- `docs/testing/sus-questionnaire.md` — standard 10-item SUS instrument + instructions + scoring
  formula + a results table to fill in. **No fabricated responses** — needs the student to
  actually administer it to 3–5 peers.
- **What's left for step 12**: the student runs the functional test table by hand in the app and
  administers the SUS questionnaire to real peers, then fills in both docs' result sections.
  Everything else (rules tests, ML writeup) is done.

## Dashboard widgets + calorie calibration ML + steps/water fixes

Prompted by a request to surface calorie/steps/water on the home page and "train ML" for the
food-calorie part too. Exploration found steps and water weren't actually new (`HealthLog.steps`/
`waterMl` already existed, logged on the Health tab) but had two real bugs, and food-calorie
estimation runs entirely through Gemini vision with no local dataset to train against the way the
habit recommender was trained — so a new, honestly-scoped calibration model was designed instead
of reusing that pattern directly.

**Health log schema fix** (`src/services/logsService.ts`): `logHealth`'s `addDoc` created a new
random-ID doc every save instead of one-per-day, so "today's total" was never reliable. Replaced
with `upsertHealthLog`/`incrementWaterMl`/`incrementSteps` — all `setDoc(doc(..., dateString),
data, {merge:true})`, one doc per user per day keyed by date. Confirmed safe before changing:
`HealthLog.id` is only used as a `FlatList` key, and `fetchHealthLogsPage` orders by the `date`
*field* not doc ID, so old random-ID docs and new date-ID docs interleave correctly — no
migration needed (also nothing deployed to a real Firebase project yet).

**Steps** (`src/services/stepsService.ts`, `src/hooks/useTodaySteps.ts`): previously
`Pedometer.watchStepCount` only, no permission request, and session-relative (steps since the
screen opened, not since midnight). Fixed with a real `requestPermissionsAsync()` call and a
platform split, verified against the actual installed `expo-sensors` native module source (not
just docs) before implementing: **`Pedometer.getStepCountAsync` is iOS-only** — the Android native
module throws `NotSupportedException` for it. So iOS gets a true since-midnight total via
`getStepCountAsync` with the live session delta layered on top; Android has no device-side daily
total at all, so `useTodaySteps` falls back to whatever was last persisted in today's Firestore
doc as the baseline, adds the live session delta on top, and periodically flushes the running
total back via `incrementSteps` (throttled to every 20+ new steps, not every single step) so it
survives across app opens. **Real, documented limitation**: on Android, steps taken before the
app is opened on a given day aren't counted (would need Health Connect, out of scope). `app.json`
now includes the `expo-sensors` config plugin (`motionPermission` string) — confirmed via the
plugin's own source that this is the correct mechanism (not manual `ios.infoPlist` edits), and
that Android needs zero `app.json` changes since the native module's own `AndroidManifest.xml`
already declares `ACTIVITY_RECOGNITION`, auto-merged by Gradle.

**Water intake**: replaced the manual "type a number, overwrite" field with tap-to-add buttons
(+100/+250/+500ml on the Health tab, +250/+500ml on the new Dashboard widget) using Firestore's
atomic `increment()` via `incrementWaterMl` — both screens read the live running total via the
new `subscribeToTodayHealthLog`.

**Dashboard widgets** (`src/components/MetricCard.tsx`, `src/screens/dashboard/DashboardScreen.tsx`):
three new cards in the existing `FlatList`'s `ListHeaderComponent` (Calories today, Steps today,
Water today with inline quick-add buttons), backed by `subscribeToTodayFoodLogs` (new, in
`foodService.ts` — deliberately no `orderBy` in the query, sorted client-side instead, to avoid
needing a composite Firestore index for an equality-filter-plus-different-field-orderBy query),
`useTodaySteps`, and `subscribeToTodayHealthLog`.

**Food-calorie calibration model** (`functions/src/ml/linearRegression.ts`,
`functions/src/food/nutritionReference.ts`, `calorieSyntheticData.ts`, `trainCalorieModel.ts`,
`model/calorieWeights.generated.ts`): mirrors the habit model's genuine-ML pattern (dependency-free
gradient descent, synthetic training data, offline `npm run train:calories` script writing
compiled-in weights) but honestly re-scoped — there's no real nutrition dataset in the repo, so
training data is synthesized around a curated ~24-category calories-per-100g reference table
(typical/approximate figures, not clinical-grade) instead. `analyzeFoodPhoto.ts` now also asks
Gemini for a numeric `estimatedPortionGrams` per item (more reliable than regex-parsing the
existing free-text portion string), keyword-matches each item's name against the reference table,
and — **only when a confident match is found** (no forced nearest-match fallback, since a wrong
forced match would inject a confidently-wrong signal) — runs the trained model as a cross-check,
attaching a `calibrationNote` to the response. Stays silent when nothing matched rather than
implying calibration happened. Shown in `FoodScanScreen.tsx` as a small caption under the total
calories.

**Trained for real, 2026-08-18** (`cd functions && npm run train:calories`):
```
1152 training samples, 288 validation samples
train MAE: 145.4 kcal
validation MAE: 121.7 kcal
validation baseline MAE (always predict mean): 377.3 kcal
```
The model beats the "always predict the mean" baseline by roughly 3x on held-out validation data
— genuine signal recovered from noisy synthetic examples, reported honestly (this measures how
well the model recovers the reference table's implied calories from portion+category, not
real-world calorie accuracy, since the underlying reference values are themselves typical
estimates, not ground truth).

**Verification**: `npx tsc --noEmit` passes with zero errors in both the root app and
`functions/`. Firestore rules tests re-run against the real emulator as a regression check — no
rule changes were needed (the existing per-user wildcard already covers new fields/collections),
so this confirms nothing broke.

**What's left**: cannot drive the real Expo UI (device sensors especially) from here — the
student should manually verify the three Dashboard widgets, the water quick-add buttons, and step
counting on real iOS *and* Android devices (simulators/emulators don't have real step sensors)
before relying on this for a demo.

## Home page ("advanced app") upgrade — progress bars, trends, quick actions, streaks

Follow-up to the Dashboard widgets pass: user asked for the home page to feel more like an
"advanced app," picked all four offered upgrades (goal progress bars, weekly trend
mini-charts, quick-action shortcuts, streaks/motivational callouts) plus real editable daily
goals in Settings.

- **Daily goals** (`src/constants/goals.ts`, `src/services/profileService.ts`,
  `SettingsScreen.tsx`): new `dailyGoals` field on `UserProfile` (optional, so pre-existing
  profiles fall back to `DEFAULT_DAILY_GOALS`), editable via a new "Daily goals" card in Settings.
- **Progress bars & sparklines**: no charting/SVG library is installed, so both are hand-built
  from plain `View`s (`MetricCard.tsx`'s `progress` prop, new `Sparkline.tsx`) rather than adding
  a new native dependency mid-project — avoids any Expo Go compatibility risk that couldn't be
  verified without a rebuild.
- **Weekly trends**: new bounded queries (`fetchRecentFoodLogs`, `fetchRecentHealthLogs`) —
  range filter + `orderBy` on the same field, so no composite Firestore index needed (same
  reasoning as the earlier `subscribeToTodayFoodLogs` design).
- **Quick actions**: new `QuickActionButton.tsx`, navigates to the Food/Habits/Health tabs via
  `useNavigation()`.
- **Streaks**: `src/utils/streaks.ts` computes the longest current streak from a bounded 30-day
  habit-log window (`fetchRecentHabitLogs`, new). Documented simplification: treats every day as
  "scheduled," doesn't respect each habit's `daysOfWeek` — fine for a motivational badge, not
  used anywhere the recommendation engine depends on.
- **Motivational callout**: `src/utils/motivation.ts`, simple rule-based copy reacting to today's
  goal progress — not ML, just UI text logic.

**Verification**: `npx tsc --noEmit` passes with zero errors. Not independently re-verified in
the running app from here — the Expo dev server was already live and being used by the user for
manual testing on their phone (Fast Refresh should pick these changes up automatically).

## App-wide consistency pass — gradient headers + home-page features everywhere

Extended the Dashboard treatment to the rest of the app, after finding a real, verifiable
inconsistency: `DashboardScreen`/`SettingsScreen`/auth screens already used a gradient hero
header, but `HabitsListScreen`, `FoodScanScreen`, and `HealthScreen` didn't (flat `colors.surface`
+ plain text, Habits had no page title at all).

- **Habits** (`gradients.accent`): gradient header with a live "N habits · N done today" line;
  per-habit "🔥 Nd" streak badges using a new `computeStreaksByHabit` (factored out of
  `streaks.ts`'s existing streak-walk logic, shared with `computeBestStreak`).
- **Food scan** (`gradients.hero`): gradient header; a `MetricCard` for "Calories today" with a
  progress bar vs. the daily goal and a 7-day trend sparkline, reusing the exact same
  `subscribeToTodayFoodLogs`/`fetchRecentFoodLogs` built for the Dashboard.
- **Health** (`gradients.leaf`): gradient header; replaced the screen's hand-rolled
  gradient-steps-card and separate water card with `MetricCard` (progress bars vs. goals + 7-day
  sparklines for both), removing visual duplication with the Dashboard's version of the same data.
- **Settings**: new "Your stats" card (total habits, best current streak, member-since date).

All of this reuses infrastructure from the previous two passes (`MetricCard`, `Sparkline`, the
`DailyGoals` system, `fetchRecentHealthLogs`/`fetchRecentFoodLogs`/`fetchRecentHabitLogs`) — no
new dependencies, no new Firestore schema.

**Verification**: `npx tsc --noEmit` passes with zero errors. Dev server confirmed still live for
the user's phone testing (Fast Refresh); no independent in-app verification from here.

## Notes

- Deployment (Firebase project + Cloud Functions deploy) requires `firebase login` on the student's machine — cannot be done by the assistant.
- SUS usability testing and literature research are the student's own work — the assistant can prep templates/questionnaires but not fabricate results.
