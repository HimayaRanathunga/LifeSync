# LifeSync — Remediation Plan

Consolidated from five parallel investigations (Dashboard, Activity/Habits, Health, Settings, ML).
Every line/file reference below was reported by an investigating agent; items marked **[verified]**
were additionally re-checked directly against the source in this repo.

---

## 1. Summary

The app is structurally sound — Firebase wiring, service layer, security rules, pagination and the
ML training pipeline all genuinely exist and are well-organised. The problem is **truthfulness**:
across five screens, values presented to the user as measurements are hardcoded demo constants, and
several features documented as shipped do not execute at all.

Three distinct defect classes:

| Class | Description | Example |
|---|---|---|
| **A — falsy-fallback** | `\|\|` over a real number: a genuine `0` is falsy and gets replaced by a fake non-zero demo value | `useTodaySteps(uid) \|\| 6840` |
| **B — pure assertion** | A literal rendered in JSX with no data source at all | `94` "Daily Vitality Score", `480 kcal`, `45 min` |
| **C — dead feature** | Code exists, is documented as working, and is never invoked | notification scheduling, `sleepHours` writes, `HabitHistoryScreen` |

Class C is the most serious for grading, because the documentation asserts these features work.

---

## 2. Severity ranking

Ordered by what actually costs marks or causes harm, not by effort.

### S1 — Data loss with no error path **[verified]**

`src/screens/settings/SettingsScreen.tsx:210-223` — `handleDelete` has no `try/catch`:

```js
onPress: async () => {
  if (!user) return;
  await deleteUserAccount(user.uid);   // deletes habits + logs + health + food + profile doc
  await logOut();                       // never runs if deleteUser throws
}
```

`src/services/exportService.ts:234-236` documents the exact hazard in its own docblock:
*"Firebase requires a recent sign-in for deleteUser — if the session is older, this throws
`auth/requires-recent-login`; callers should catch that specifically."* This caller does not.

**Failure:** on a stale session, all four collections and the profile doc are deleted, `deleteUser`
throws, `logOut()` never runs. The user remains signed in on the Settings screen with every byte of
their data gone and no message. Unrecoverable and silent.

Fix is ~10 lines. Do it first regardless of everything else.

### S2 — Fabricated ML output shown to a user who has no data

`src/screens/dashboard/DashboardScreen.tsx:856-909` — what looks like an empty-state branch is in
fact a second pair of fully invented recommendation cards:

```
"Morning Hydration & Sunlight Walk"  · 07:30 AM · Circadian Cortisol Peak · 94% Success
"Deep Focus Study & Learning"        · 08:30 PM · Evening Alpha Waves     · 91% Success
```

A brand-new account with zero habits and zero logs sees these. Cloud Functions are not deployed, so
no recommendation has ever been computed for anyone. Anyone logging in with a fresh account during
assessment sees this first.

### S3 — A "don't know" sentinel rendered as a confident statistic

`src/screens/habits/HabitsListScreen.tsx:66` renders `AI suggested · {Math.round(rec.score*100)}% likely`.

`functions/src/recommendationEngine.ts:62-70` returns `score: 0.5` verbatim for zero logs
("Not enough history yet"), and `:91-93` uses `0.5` as the unknown-slot default. So **"50% likely"
literally means "no data"**. The honest field, `rec.reason`, is rendered nowhere in the Activity tab.

### S4 — Features documented as shipped that never run **[verified]**

| Feature | Claim | Reality |
|---|---|---|
| Adaptive notifications | `PLAN.md:28` ✅, `README.md:46-48` | `syncHabitReminders`, `ensureNotificationSetup`, `disableHabitReminders` have **zero call sites** in `src/`. No push notification is ever scheduled. Rubric weight: 20% (Project Content & Innovation). |
| Sleep tracking | Health screen renders a sleep card | `upsertHealthLog` (`logsService.ts:42`) has **zero call sites**. Nothing writes `sleepHours`. The card shows `— h — m` permanently, for every user. |
| Habit history | Screen registered at `MainTabs.tsx:51-55` | No `navigate('HabitHistory')` anywhere. Also its query needs a composite index; `firestore.indexes.json` is `{"indexes": []}` **[verified]** → `FAILED_PRECONDITION` on real Firestore, and `usePaginatedList` has no `try/catch`, so it hangs on a permanent spinner. |
| Settings "Your stats" card | `PLAN.md:342` | Does not exist in the file. `src/utils/streaks.ts` and `motivation.ts` have zero importers **[verified]**. |

### S5 — A broken calibrator driving a user-facing accuracy number

`functions/src/food/calorieSyntheticData.ts:62-65` builds an **additive** feature vector
(`[portionNorm, ...oneHot]`) for a target that is a **product** (portion × category density). The
true function is not in the model's hypothesis class.

Measured on a fresh 7,000-sample draw from the shipped generator:

```
ML model MAE          120.0 kcal
lookup-table MAE       41.6 kcal   <- caloriesPer100g * grams/100, zero ML
predict-the-mean MAE  328.3 kcal   <- the only baseline currently reported
```

| Food | Reference | Model | Error |
|---|---|---|---|
| salad 400 g | 80 kcal | 314 | **+293%** |
| chocolate 50 g | 273 kcal | 1294 | **+374%** |
| nuts 100 g | 576 kcal | 1638 | +184% |
| rice 200 g | 260 kcal | 268 | +3% |

The model is ~3× worse than the one-line arithmetic that generated its own training data. This is
user-facing: `analyzeFoodPhoto.ts:145-162` writes `calibrationAvgDiffPct`, and
`src/services/accuracyService.ts:14-19` turns it into the dashboard's **"AI accuracy"** headline.

### S6 — The ML recommender is worse than doing nothing

Top-1 hour selection, 3,000 held-out simulated users, scored against the generator's own ground truth:

| Policy | Mean regret (prob. points) | Exact hit | Within ±1h |
|---|---|---|---|
| **Trained ML model** | **28.39** | 22.0% | 36.0% |
| `argmax(historicalSuccessRate)` | 27.35 | 19.4% | 36.1% |
| **Just use the declared preferred time** | **15.85** | 25.4% | **57.3%** |
| Random hour 06–22 | 40.25 | 5.9% | 16.6% |

The ML path beats only random. Cause: `MlContext` (`functions/src/ml/mlRecommender.ts:14-20`) never
receives `preferredTime`. The rule-based engine anchors on it (`recommendationEngine.ts:60, 87-89`);
the ML path discards it. At exactly 5 logs a user's recommendation jumps from *their* 07:00 to an
hour picked from noise.

Compounding it, `functions/src/ml/historicalRate.ts:40` returns `weightedSuccess / weightTotal` with
no shrinkage. A candidate hour whose only nearby attempt carries kernel weight `1e-7` returns 0.0 or
1.0 at full confidence — and `mlRecommender` takes an **argmax over 17 hours**, so the thinly-evidenced
lucky hour wins. Textbook winner's curse.

### S7 — Documentation asserting things that are measurably false **[verified]**

| Claim | Location | Reality |
|---|---|---|
| "zero hardcoded hex colors remain in `src/screens/`" | `PLAN.md:131` | **899** hex literals in `src/screens/` |
| "verified WCAG AA contrast done" 🟢 | `PLAN.md:12, 31` | Verified for `theme.ts` — but **no screen consumes `theme.ts`**. 8 measured AA failures in Settings alone, incl. the primary save button in both themes; 7 in Health. |
| "68.0% validation vs 65.0% baseline" | `README.md:38` | Real: 70.6% / 69.2%. `PLAN.md` contains **three mutually inconsistent** metric sets (`:112`, `:199-204`, `:276-283`). |
| "the 81.8% F1-score confirms balanced predictive utility" | `docs/testing/ml-evaluation.md:65` | On a 69.2%-positive set, an always-yes classifier scores F1 = 2(0.692)/(1.692) = **81.8%** — identical. F1 cannot detect this model's behaviour. |
| calorie model "beats the baseline by roughly 3x — genuine signal recovered" | `PLAN.md:280` | Backwards. See S5. |

### S8 — Cross-screen incoherence

The same user, same day, three tabs, three step counts:

| Screen | Line | Shows |
|---|---|---|
| Dashboard | `DashboardScreen.tsx:126` | 6,840 |
| Health | `HealthScreen.tsx:40` | 6,840 |
| Settings | `SettingsScreen.tsx:83` | **5,500** |

All three call the same correct hook and then each corrupts it with a different fake default.

---

## 3. Shared-file conflict resolutions

Five agents independently requested changes to the same files. These are the decisions.

### 3.1 `src/hooks/useTodaySteps.ts` — three claimants

The hook collapses **loading**, **pedometer-unavailable** and **permission-denied** into a single
`null`, and its own docblock (line 30) tells callers to conflate them.

- Dashboard agent proposed a **breaking** change to `{ steps, status }`.
- Health agent proposed an **additive** `useTodayStepsDetailed`.
- Settings agent proposed an **additive** `useTodayStepsState` returning a discriminated union.

**Decision: the Settings agent's additive discriminated union.**

```ts
export type StepsState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: 'no-pedometer' | 'permission-denied' }
  | { status: 'ready'; steps: number };

export function useTodayStepsState(uid: string | undefined): StepsState;
export function useTodaySteps(uid: string | undefined): number | null;  // thin wrapper, kept
```

Rationale: the union carries `reason`, which the other two proposals lose, so the UI can say
*"Step permission not granted"* vs *"Step tracking unavailable on this device"*. Additive keeps all
three screens compiling, so the phases can land independently instead of as one large atomic change.
Delete the wrapper once all three call sites migrate.

Implementation: `useTodaySteps.ts:45` → `{status:'unavailable', reason:'no-pedometer'}`;
`:48` → `'permission-denied'`; `:63-66` → `{status:'ready', steps}`; add `if (!uid)` → `'loading'`.

### 3.2 `src/types/index.ts` — four claimants, all additive, no conflict

Land as one edit:

1. `HealthLog.sleepHours` / `waterMl` / `steps` → **optional**. Every writer is a partial merge
   (`incrementSteps` creates `{date, steps}` with no `waterMl`), so the current non-optional typing
   is false and hides missing `?? 0` guards from the compiler.
2. `Habit.category?: string` — see 3.6.
3. `UserProfile.avatarUri?: string | null`, `avatarEmoji?: string | null` — removes the `as any`
   casts at `SettingsScreen.tsx:104-105`.
4. **Flag, do not fix:** `Habit.createdAt` is typed `number` but is a Firestore `Timestamp` in
   practice (`seedDatabase.ts:225`, `functions/src/index.ts:124`). Any UI arithmetic on it breaks on
   seeded data. Note it; fixing it is a separate change with its own blast radius.

### 3.3 `src/services/logsService.ts` — deterministic log IDs

Two agents found this independently, from opposite ends:

- **Activity:** the app uses `addDoc` auto-IDs while the seeder uses `logs/{habitId}_{date}`
  (`seedDatabase.ts:248`). Toggling a habit off→on writes **two docs for the same habit-day**; the
  rendered tick is effectively arbitrary.
- **ML:** those duplicates inflate `logs.length`, so `MIN_SAMPLES_FOR_ML = 5` is crossed early with
  insufficient real data, **and** attempts are double-counted in `computeHourlySuccessRates`
  (`functions/src/index.ts:38-49`).

So this is not a UI bug — it corrupts the ML pipeline's input. **Priority: high.**

```ts
export function logHabitCompletion(uid: string, entry: Omit<HabitLog, 'id'>) {
  return setDoc(doc(logsCollection(uid), `${entry.habitId}_${entry.date}`), entry);
}
```

Key order must be `habitId_date` to match the seeder, or seeded and app-written rows become two docs
again. `setDoc`/`doc` are already imported. No rules change needed.

Then make `completedMap` (`HabitsListScreen.tsx:157-163`) prefer the canonical doc so legacy
auto-ID duplicates cannot win. Note: this does not migrate existing duplicates; they age out.

### 3.4 `src/utils/dates.ts` — new file, three consumers

The same UTC-vs-local bug exists at `HabitsListScreen.tsx:96`, `HabitHistoryScreen.tsx:23`,
`DashboardScreen.tsx:111`, `HealthScreen.tsx:33,115`.

```ts
export function toDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

### 3.5 `src/utils/streaks.ts` — timezone fix, land once **[verified]**

`currentStreakFromDates` takes **local** midnight and then formats it as **UTC**:

```js
const cursor = new Date();
cursor.setHours(0, 0, 0, 0);                      // local midnight
if (!dates.has(cursor.toISOString().slice(0, 10)))  // ...read back as UTC
```

Executed on this machine (UTC+5:30):

```
local midnight       : Tue Aug 25 2026 00:00:00 GMT+0530
toISOString().slice  : 2026-08-24     <- yesterday
actual local date    : 2026-08-25
```

The client's "today" is permanently one day behind for every positive UTC offset — not just near
midnight. A user who completed a habit today sees streak `0`. Currently invisible only because
nothing imports the file. Replace both `toISOString().slice(0,10)` calls with `toDateKey(cursor)`.

Callers must use `map.get(id) ?? 0` — `computeStreaksByHabit:53` deliberately omits zero-streak
habits, so `||` here would reintroduce the exact bug being removed.

Also warn the Dashboard work: `DashboardScreen.tsx:200` calls `fetchRecentHabitLogs(user.uid, today)`
— a **today-only** window, so any streak computed from it can never exceed 1.

### 3.6 `Habit.category` — persist it or delete the picker

`AddEditHabitScreen.tsx:77` makes the user pick a Category, highlights it, and **discards it on
save**. `HabitsListScreen.tsx:44-48` then derives the card icon by hashing the Firestore auto-ID, so
"Drink 500ml Water" gets a dumbbell or a coffee cup at random.

**Decision: persist it.** One optional field, and it replaces a random icon with a chosen one.
Keep `paletteForHabit(h.id)` as the legacy fallback for habits created before the field existed.
(Honest removal of the picker is the acceptable alternative; leaving it as-is is not.)

### 3.7 `src/theme/theme.ts` — assign centrally, once

Health and Settings both need dark-mode-safe accent tokens that do not exist. The theme has no token
for the orange and sky-blue accents these screens use, and `brandCyanText` (`#0E7490`) itself fails
on a dark surface. All screens hit the same gap — add the tokens in one edit before any screen
migrates its colours.

### 3.8 `src/hooks/usePaginatedList.ts`

Export `initialized` (tracked at line 20, not returned at line 84) and wrap `loadFirstPage`/`loadMore`
in `try/finally` so a rejection cannot strand `loading: true` forever. Affects habit, health and food
history lists.

### 3.9 `src/components/CircularProgressRing.tsx`

`leftValue = '520'` — a demo number baked into a shared primitive as a default. Change to `'—'` (both
current callers pass it explicitly, so this is zero-risk) and port the divide-by-zero guard that
`CircularProgress.tsx:45` already has correctly (`max === 0 ? 0 : value / max`). `NaN` survives the
current clamp at line 29 and reaches `strokeDashoffset`, which renders unpredictably.

---

## 4. Phased plan

### Phase 0 — Safety and unblock

| # | Task | File |
|---|---|---|
| 0.1 | `try/catch` on Delete Account, handle `auth/requires-recent-login` specifically, add a second confirmation, disable while in flight | `SettingsScreen.tsx:210-223` |
| 0.2 | `cd functions && npm install` — `functions/node_modules` does not exist, so `npm run train` fails today | — |
| 0.3 | Add the composite index `logs(habitId ASC, date DESC)` | `firestore.indexes.json` |

### Phase 1 — Shared foundations

No visible UI change; everything downstream depends on these. Land in this order.

| # | Task | Section |
|---|---|---|
| 1.1 | Create `src/utils/dates.ts` | 3.4 |
| 1.2 | Fix `streaks.ts` timezone, apply `toDateKey` at all five sites | 3.5 |
| 1.3 | `types/index.ts` — four additive changes | 3.2 |
| 1.4 | `logsService.ts` — deterministic doc IDs | 3.3 |
| 1.5 | `useTodaySteps.ts` — additive tri-state | 3.1 |
| 1.6 | `usePaginatedList.ts` — export `initialized`, add `try/finally` | 3.8 |
| 1.7 | `CircularProgressRing.tsx` — drop the `'520'` default, guard NaN | 3.9 |
| 1.8 | `theme.ts` — add dark-safe accent tokens | 3.7 |

After 1.3 and 1.5, run `npx tsc --noEmit` and treat every new error as a real unhandled empty state.
The compiler will generate the Phase 3 work list for you.

### Phase 2 — ML correctness

Independent of the UI, and the highest-value phase for grading.

| # | Task | Detail |
|---|---|---|
| 2.1 | Add Beta shrinkage to `historicalRate.ts:40` | `(weightedSuccess + 5*0.5) / (weightTotal + 5)`. **Measured: regret 27.2 → 13.5, within ±1h 37% → 64%.** Shared by generator and inference, so it fixes train and serve together — and therefore mandates a retrain. |
| 2.2 | Give the ML path the preferred time | Replace `sinHour`/`cosHour` with `hourOffsetSin`/`hourOffsetCos` computed from `hour - preferredHour`. Add `preferredHour` to `RawFeatures`, `MlContext`, and populate at `index.ts:125-131`. Generator must emit a declared preferred hour so training matches serving. Feature count stays 7. |
| 2.3 | Fix the calorie feature vector | `calorieSyntheticData.ts:62-65` → interaction form `oneHot(cat) × min(grams, cap)/cap`. 36 → 35 features. `analyzeFoodPhoto.ts:145` imports the same function, so inference follows automatically. **Retrain in the same commit** — `linearRegression.ts:20-30` throws on a stale 36-dim model, which is the right failure mode. |
| 2.4 | Replace misleading metrics in `train.ts` | Add `alwaysYesF1 = 2p/(p+1)` printed next to the model's F1; ROC AUC (rank-sum, ~15 lines, no dependency); Brier + Brier skill score; Bayes ceiling from the generator's `trueProbability`. |
| 2.5 | Add the top-1-hour ranking harness | The deployed model never uses its 0.5 threshold — `mlRecommender.ts:40` only compares probabilities across hours. Report `meanRegret`, `top1Accuracy`, `within1hAccuracy` for five policies incl. `argmax(historicalSuccessRate)` and declared-preferred-hour, on a **disjoint** user split. |
| 2.6 | Add the lookup baseline to `trainCalorieModel.ts` | Print mean, lookup and model MAE together. Never quote the mean baseline alone again. |
| 2.7 | Retrain both models, propagate | `npm run train`, `npm run train:calories`, `npx tsc --noEmit`. Copy printed numbers mechanically — never retype. |

**Reference values on the current shipped model** (will change after 2.1/2.2 — re-read from the run,
do not copy these):

```
positive rate            0.692
accuracy   71.0   |  always-yes 69.2  |  Bayes ceiling 76.6
F1         82.1   |  always-yes 81.8  |  <- identical, by construction
ROC AUC   0.6412  |  chance 0.5000    |  oracle 0.7724
Brier     0.2010  |  base-rate 0.2141 |  oracle 0.1662  (BSS 0.061 vs oracle 0.224)
```

The data generator is **not** the problem: there are 7.4 points of headroom between baseline (69.2%)
and the Bayes ceiling (76.6%), and the model captures 1.8 of them. AUC 0.641 vs an oracle ceiling of
0.772 means it captures 52% of achievable discrimination — a modest but genuine, reportable result.
Accuracy and F1 were simply the wrong metrics for a 69%-positive problem.

`streakNorm ≈ 0.0017` is **correct behaviour, not a bug** — the generator gives streak a maximum
effect of ~0.05 probability points, and the model correctly identified it as negligible. Do not
"fix" it.

#### Pre-registered acceptance criterion — write this into `ml-evaluation.md` *before* running 2.7

> Keep the ML path in `index.ts` only if, after retraining, the model's `meanRegret` beats both
> `argmax(historicalSuccessRate)` and the declared-preferred-hour policy on the held-out scenario
> set. If it does not, route all habits through the rule-based engine, keep the ML code and its
> evaluation in the repo as a documented negative result, and state plainly in the report that a
> 7-feature global logistic regression could not beat a well-calibrated per-user heuristic.

A metric change that can only produce a favourable number is metric-shopping. A metric change that
can fail is a correct experiment. **A documented negative result with a sound method is a first-class
outcome for this module; an inflated positive is not.**

### Phase 3 — Screens

Now compiler-guided. Each screen: remove Class A fallbacks, resolve Class B literals, render
loading / unavailable / real-zero distinctly.

**House style for "no value" is the literal `—`** — already correct in `exportService.ts:179,185`
and `HealthScreen.tsx:566-574`. There is no skeleton component in this project; do not build one.

#### 3a. Dashboard

- Delete `INITIAL_NOTIFICATIONS` (lines 46-97) — canned, and line 80 hardcodes a second copy of 6,840.
  The type is literally named `FakeNotification`. Either derive alerts from real state or remove the
  bell entirely; `notificationsService.ts` is the proper home for reminders.
- Replace the fake recommendation cards (856-909) with a genuine empty state.
- Derive macro targets from `calorieTarget` instead of the hardcoded 412/132/180 — which sum to
  3,796 kcal against a stated 2,665 target. A 50/20/30 split (WHO/IOM AMDR midpoints) sums back to
  the calorie target exactly.
- `rec.score ?? 0`, not `|| 0.85`. `score` is required and always written.
- Render the data already fetched and discarded: `weatherMessage` (a real location + network call
  whose result is never displayed), `completedTodayIds`, and `logHabitCompletion` (imported, never
  called).
- "45 min Active Time" has **no possible source** — `watchStepCount` yields a cumulative delta with
  no timestamps. Replace with step-goal % or delete the tile. Do not label it "estimated".
- Heart rate: keep the simulation, add a `SIMULATED` chip, and delete the unconditional
  **"100% Healthy"** claim at line 783.

#### 3b. Health

- Rename "Daily Vitality Score" → **"Daily Goal Score"** and compute a weighted goal-attainment index
  over only the components that have data (steps 0.40, hydration 0.25, sleep 0.35, renormalised over
  what is available), with a mandatory subtitle *"Based on N of 3 daily goals"* and `—` when N = 0.
  The app has no physiological signal at all — no HRV, no real HR, no sleep stages — so a number
  labelled "Vitality" would be fabricated regardless of how it is computed. If the rename is
  rejected, delete the card; do not keep the word with a computed number behind it.
- Delete the `80%` / `4.8km` / `75%` corner badges — there is no honest denominator for an
  "active burn target"; `calorieTarget` is an intake target.
- Delete the Workout Duration card entirely.
- Derive distance and active burn from steps × height/weight, returning **`null`** when the profile
  lacks them — never a substituted default, which would reintroduce the defect.
- `Steps / 10,000` contradicts `goals.stepTarget` (default **8,000**, user-editable). Use the goal.
- `steps.toLocaleString()` at line 449 is a **hard crash** the moment `|| 6840` is removed.
- Line 551's "Steady & Rested" is rendered unconditionally — derive the band from `bpm`.

#### 3c. Activity (Habits)

Cleanest of the five — **no hardcoded stat, percentage or progress bar anywhere**. The defects are
structural.

- Stop the AI suggestion masking the user's own time (`:61`). Display `h.preferredTime`; offer
  `rec.suggestedTime` as an explicit "Use suggested" affordance in the edit sheet. Without this, the
  user edits the time, taps Done, and the card does not change — the edit looks broken.
- Gate the confidence percentage on ≥3 real attempts; otherwise show the schedule. Surface
  `rec.reason` — the only fully honest field the recommender produces.
- Await the write before showing **"Habit Created!"** — `setCreated(true)` currently fires *before*
  the write, with `.catch(console.warn)`, so offline still shows a green success and navigates away.
- Persist `category` (3.6).
- Make `HabitHistoryScreen` reachable — but only **after** Phase 0.3, or it ships a hard query
  failure that works against the emulator and fails in production.

#### 3d. Settings

- The three fake numbers (5,500 / 1,450 / 1,200), plus a **fabricated email address** at line 601
  (`user?.email || 'user@lifesync.app'`).
- Remove the `Math.max(20, …)` floors at lines 660 and 671 — a 20% minimum fill means **0 ml renders
  as a one-fifth-full gauge**, which survives the fallback fix and keeps lying.
- Replace the three fabricated routine cards ("Daily Meditation (10 min)", "Workout Session
  (45 min)", "Evening Reading (15 pages)") with the user's real habits. `Habit` has **no duration
  field** — `(10 min)` claims a measurement the schema cannot store, and none of the three titles
  match any real seeded habit.
- Replace the static "AI Coach Insight" string with the top real recommendation's `reason` +
  `suggestedTime` + `score`. Highest demo value on the screen: it currently misrepresents the
  project's main assessed feature with a hardcoded sentence.
- Validate goal input. `parseInt('-5') || DEFAULT` → **`-5` persists**, and Android's numeric keypad
  has a minus key. A saved negative target renders `height: "-62%"` here and drives every progress
  ring in the app negative. Use range validation + `keyboardType="number-pad"` (no minus key), and
  add the missing `try/catch` — the save currently has none while the two export handlers do.
- Fix the input-clobbering race: lines 106-111 re-seed the three inputs from *every* profile
  snapshot, so tapping an avatar preset mid-edit reverts what the user is typing.
- Relabel "Upload Avatar Photo" — nothing is uploaded. `handlePickImage` persists the raw
  ImagePicker **local cache URI** into Firestore, which survives neither reinstall nor a second
  device.

### Phase 4 — Documentation truth pass

Correct every claim in S7. Specifically:

- `PLAN.md:12, 31` — the WCAG status is not defensible while no screen consumes `theme.ts`.
- `PLAN.md:131` — 899 hex literals, not zero.
- `PLAN.md:28` / `README.md:46-48` — notifications (see §5).
- `PLAN.md:342` — the stats card does not exist.
- `PLAN.md:105, 112, 199-204, 276-283`, `README.md:38`, `docs/diagrams/ml-pipeline.mmd:2,13` (+ its
  PNG) — stale and mutually inconsistent metrics.
- `ml-evaluation.md:65` — delete the F1 claim, replace with the arithmetic showing it equals the
  always-yes classifier's. `:64` — a 0.4-point train/val gap on a 7-parameter model shows little
  capacity to overfit, not "excellent generalization". `:55-59` — reinterpret the feature weights.
- Add a **"Limitations and threats to validity"** section: all data is synthetic and self-authored,
  so every metric measures the model's ability to recover a relationship the author encoded.
- Reframe the calorie model honestly as **parameter recovery, not prediction** — it is trained to
  recover `nutritionReference.ts`'s own numbers, so the correct baseline is the lookup table (the
  injected noise floor), not "always predict the mean".

#### Stop the drift structurally

The root cause is that metrics are **retyped by hand into prose**. Have `train.ts` additionally emit
`docs/testing/ml-metrics.generated.md` from the same objects it already writes into
`weights.generated.ts`; keep `ml-evaluation.md` for methodology and interpretation only, linking to
the generated table. Make `README.md:38` state the *shape* of the claim ("beats the majority-class
baseline by a small margin; see the generated table") — a qualitative statement cannot go stale.

#### `ml_python/`

Recommendation: **keep it, but stop it asserting untrue things.** It is the only Python in the repo
and the report likely needs it as evidence; deleting it removes that. But it is currently undisclosed
dead code — the only reference to it anywhere is its own README.

1. Rewrite `ml_python/README.md` to state in the first paragraph that it is a parallel exploration,
   **not** called by the app or the Cloud Functions, and that production models live in
   `functions/src/`. Include a table of the differences (6 vs 7 features, raw vs standardized,
   different synthetic DGPs) so the divergence is a documented decision rather than an accident.
2. `README.md:9` documents `/api/predict_food_calories`. **That endpoint does not exist** — the
   server defines only `/api/health` and `/api/predict_habit_slot`.
3. `habit_model_weights.json` reports **`"accuracy": 1.0`** with no baseline — the single most
   obvious red flag an examiner looks for. It is an artifact of a degenerate generator
   (`train_habit_recommender.py:46` thresholds a linear function of the model's own inputs, giving a
   ~99% positive class). Print the class balance and majority baseline alongside it, and say in the
   README why 100% accuracy is a warning sign. This turns the most damaging artifact in the repo into
   demonstrated understanding.
4. `ml_api_server.py:62` fabricates the dominant feature (`hist_rate = 0.8 if 7<=h<=9 or 17<=h<=19
   else 0.5`). Working through the exported weights, the argmax is deterministic: **the endpoint
   returns `19:00` at ~99.9% confidence for every request, regardless of input.** Either accept real
   rates in the request body, or label it unambiguously as a fixed-response demo.
5. `food_classifier.py:69-80` returns a hardcoded fake analysis (485 kcal, health score 95) when the
   API key is absent. Raise instead.

### Phase 5 — Deploy

Nothing in Phase 2 executes in the live app until this runs. Requires your Google account.

```bash
firebase login
firebase use --add                              # creates .firebaserc — currently missing
firebase functions:secrets:set GEMINI_API_KEY   # required by analyzeFoodPhoto.ts:9
firebase deploy --only functions,firestore:rules,firestore:indexes
```

Blaze plan required (scheduler + outbound Gemini calls).

---

## 5. Decisions needed from you

1. **Notifications (S4).** Rubric weight 20%. Either wire `syncHabitReminders` to a recommendations
   subscription so the documented feature actually exists, or correct `PLAN.md:28` and
   `README.md:46-48`. Wiring it is real work; the docs are currently false either way.

2. **Sleep (S4).** Add a "log last night's sleep" control writing through the already-existing,
   never-called `upsertHealthLog` — which also unlocks the third component of the Goal Score and the
   ML's `sleepHoursNorm` feature — or delete the card. Note the cascade: because nothing writes
   `sleepHours`, `functions/src/index.ts:106` filters to an empty set and `sleepHoursNorm` is a
   **constant 0.7 for every real user, forever**, while the model was trained on data where sleep
   genuinely varies and drives the label. That is a train/serve mismatch on 1 of 7 features.

3. **Demo data.** After these fixes a fresh account looks markedly emptier — that is the point, but
   it will read as less impressive in a demo. The honest fix is to run
   `functions/src/seed/seedDatabase.ts` (21 days of real habits, health and food logs) so the screens
   fill with data that is genuinely in the database, rather than reintroducing constants.

4. **Expo version.** `AGENTS.md` mandates the v57 docs; `package.json` pins `expo ~54.0.37`. Upgrade,
   or correct `AGENTS.md`.

---

## 6. Open items — not determined from code

- Post-retrain ML numbers. Nothing was retrained; every "expected" figure comes from re-simulating
  the shipped generator and re-scoring the shipped weights. The shrinkage result (regret 27.2 → 13.5)
  is a direct measurement of the *policy*; the retrained *model's* numbers are unknown until 2.7 runs.
- Whether 2.2's relative-hour features beat `argmax(historicalSuccessRate)`. A hand-weighted proxy
  did not. This is exactly why the acceptance criterion is pre-registered.
- Whether `firestore.rules` permits client **reads** of `users/{uid}/recommendations`. The Settings
  "AI Coach Insight" fix depends on it; `exportService.ts` implies reads are allowed. Verify first —
  a `permission-denied` surfaces as a silent empty array and a misleading "no suggestions yet".
- Whether `expo-sensors`' pedometer is available in the Expo Go build in use — this decides whether
  the new "unavailable" state is the common case or a rare one, and therefore how visible `—` is.
- Whether any existing profile already holds an out-of-range `dailyGoals`. The display guards fix
  rendering; they do not repair a doc already poisoned by the current build.
- How `docs/diagrams/*.png` were rendered. No tooling is recorded anywhere in the repo.
- Contrast ratios were computed by the investigating agents with the standard WCAG relative-luminance
  formula. The *ordering* is not in doubt, but recompute before quoting specific ratios in the report.
