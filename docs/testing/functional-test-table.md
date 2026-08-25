# LifeSync — Functional Test Table

Manual, end-to-end functional test cases covering every feature in the app (`src/screens/`).
Run each test case against the app (Expo Go or a simulator/device, ideally connected to the
Firebase Emulator Suite so no real user data is touched) and fill in **Actual Result** /
**Status** (Pass/Fail) as you go. This table is the evidence artefact for the "Testing &
Evaluation" rubric criterion — keep it as-run (don't edit results retroactively).

| ID | Feature | Test Steps | Expected Result | Actual Result | Status |
|----|---------|-----------|------------------|----------------|--------|
| F01 | Signup | Open Signup screen, enter a new email + password, submit | New Firebase Auth account is created, user is navigated into the app (Onboarding, since no profile exists yet) | | |
| F02 | Signup — validation | Submit Signup with an invalid email or a password under Firebase's minimum length | Inline/error feedback is shown, no account is created | | |
| F03 | Login | Open Login screen, enter valid credentials, submit | User is authenticated and navigated to the main app (Dashboard) | | |
| F04 | Login — wrong password | Enter a valid email with an incorrect password | Error message shown, user stays on Login | | |
| F05 | Logout | From Settings, trigger logout | Auth session ends, app navigates back to Login | | |
| F06 | Onboarding | Complete onboarding as a first-time user (profile details / initial habit) | Profile data is saved to Firestore (`users/{uid}`), user lands on Dashboard afterwards | | |
| F07 | Dashboard — recommendations display | Open Dashboard with at least one habit that has logged completions | Recommended time(s) for the habit are shown, sourced from `recommendations` subcollection | | |
| F08 | Dashboard — recompute on demand | Trigger the "recompute my recommendations" action (if exposed in UI) or wait for a natural update | Cloud Function `recomputeMyRecommendations` runs, Dashboard reflects the refreshed recommendation | | |
| F09 | Habits — add | From Habits tab, add a new habit (title + preferred time) | New habit document created under `users/{uid}/habits`, appears in the Habits list immediately | | |
| F10 | Habits — edit | Open an existing habit, change its title/time, save | Habit document updated in Firestore, list reflects the change | | |
| F11 | Habits — mark complete | Mark a habit complete for today | A completion log is written (used later by the recommendation engine/ML model), streak updates | | |
| F12 | Habits — delete | Delete a habit | Habit document removed from Firestore, disappears from the list | | |
| F13 | Habit history | Tap a habit to open `HabitHistoryScreen` | Shows that habit's completion history only (not other habits' logs), paginated | | |
| F14 | Habit history — pagination | On a habit with >1 page of logs, tap "Load more" | Next page of logs for that same habit loads and appends, cursor-based (`fetchHabitLogsPage`) | | |
| F15 | Health — log entry | On Health tab, submit a new health log (e.g. sleep hours) | New doc written to `users/{uid}/healthLogs`, "Recent logs" list refreshes to include it | | |
| F16 | Health — pagination | With >1 page of health logs, tap "Load more" | Next page of health logs loads and appends | | |
| F17 | Food scan — capture/pick photo | On Food tab, take or pick a food photo | Image is resized/compressed client-side (`imageUtils.ts`, capped ~1024px) before upload | | |
| F18 | Food scan — analysis | Submit a food photo for analysis | `analyzeFoodPhoto` Cloud Function returns food items, calories, macros, freshness/condition assessment, health tip, confidence score; result displayed on screen | | |
| F19 | Food scan — save to history | After a successful scan | Result is saved to `users/{uid}/foodLogs`, appears in "Recent scans" | | |
| F20 | Food scan — pagination | With >1 page of food logs, tap "Load more" | Next page of food scan history loads and appends | | |
| F21 | Food scan — bad photo | Submit a photo with no identifiable food (e.g. a blank/random image) | Function returns a low-confidence result or graceful message rather than crashing | | |
| F22 | Adaptive notifications | Update a habit's recommended time (e.g. via recompute) | Local push notification schedule (`notificationsService.ts`) re-syncs to the new recommended time | | |
| F23 | Context-awareness — weather | Open Dashboard/relevant screen that reads `weatherService.ts` | Current weather is fetched and factored into context (no crash if the weather API is unreachable) | | |
| F24 | Settings — theme/profile | Open Settings, change an editable setting (e.g. profile field) | Change persists to Firestore and survives app reload | | |
| F25 | Security — cross-user isolation (manual spot-check) | While logged in as User A, attempt to navigate to or fetch User B's data via any in-app path | No path in the UI allows it; any direct Firestore access attempt is denied (see automated coverage in `firestore-tests/rules.test.ts`) | | |
| F26 | Accessibility | Navigate the app with a screen reader (VoiceOver/TalkBack) or check tab order | Interactive elements announce role/label, touch targets are reachable and ≥44pt | | |
| F27 | Offline resilience | Toggle device network off, use a screen backed by Firestore | App doesn't crash; Firestore offline persistence serves cached data where available | | |

## Automated coverage (already executed, see below)

Firestore security rules are covered by an automated suite, not manual testing — see
`docs/testing/firestore-rules-results.md` (or the "Firestore rules tests" section of
`PLAN.md`) for the actual pass/fail run.
