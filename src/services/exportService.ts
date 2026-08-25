import { Share } from 'react-native';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser } from '@firebase/auth';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { db, auth } from '../config/firebase';
import { fetchAllHabits, deleteAllHabits } from './habitsService';
import {
  fetchAllHabitLogs,
  deleteAllHabitLogs,
  fetchAllHealthLogs,
  deleteAllHealthLogs,
  fetchRecentHabitLogs,
} from './logsService';
import { fetchAllFoodLogs, deleteAllFoodLogs, fetchRecentFoodLogs } from './foodService';
import { fetchAllRecommendations } from './recommendationsService';
import { computeFoodPredictionAccuracy, computeHabitPredictionAccuracy } from './accuracyService';
import type { UserProfile } from '../types';
import { toDateKey } from '../utils/dates';

// The "daily routine" window the app currently seeds/tracks in detail — keeps the exported
// routine data scoped to the same recent period rather than a user's entire habit history.
const ROUTINE_WINDOW_DAYS = 21;

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}

/** Bundles everything the user has stored into one JSON blob and hands it to the OS share sheet (save/email/etc). */
export async function exportUserData(uid: string): Promise<void> {
  const sinceDate = dateNDaysAgo(ROUTINE_WINDOW_DAYS);
  const [profileSnap, habits, habitLogs, healthLogs, foodLogs] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    fetchAllHabits(uid),
    fetchRecentHabitLogs(uid, sinceDate),
    fetchAllHealthLogs(uid),
    fetchAllFoodLogs(uid),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    profile: profileSnap.exists() ? profileSnap.data() : null,
    habits,
    habitLogs,
    healthLogs,
    foodLogs,
  };

  await Share.share({ message: JSON.stringify(data, null, 2), title: 'LifeSync data export' });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds and shares a PDF report covering the last ROUTINE_WINDOW_DAYS of habits/meals/water,
 * plus an "AI Prediction Accuracy" section — see accuracyService.ts for how each figure is
 * derived. Renders HTML with expo-print (no server round-trip) then hands the file to the OS
 * share sheet with expo-sharing.
 */
export async function exportUserDataAsPdf(uid: string): Promise<void> {
  const sinceDate = dateNDaysAgo(ROUTINE_WINDOW_DAYS);

  const [profileSnap, habits, habitLogs, foodLogs, recommendations] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    fetchAllHabits(uid),
    fetchRecentHabitLogs(uid, sinceDate),
    fetchRecentFoodLogs(uid, sinceDate),
    fetchAllRecommendations(uid),
  ]);

  const profile = profileSnap.exists() ? (profileSnap.data() as UserProfile) : null;
  const foodAccuracy = computeFoodPredictionAccuracy(foodLogs);
  const habitAccuracy = computeHabitPredictionAccuracy(recommendations, habitLogs);

  const joinedDate = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Unknown';
  const totalCalories = foodLogs.reduce((sum, log) => sum + (log.totalCalories || 0), 0);
  const completedLogs = habitLogs.filter((l) => l.success).length;
  const completionRatePct = habitLogs.length > 0 ? Math.round((completedLogs / habitLogs.length) * 100) : null;

  const habitRows = habits
    .map(
      (h, i) =>
        `<tr class="${i % 2 === 0 ? 'row-a' : 'row-b'}"><td>${escapeHtml(h.title)}</td><td class="num">${escapeHtml(h.preferredTime)}</td></tr>`
    )
    .join('');

  const mealRows = foodLogs
    .slice(0, 30)
    .map(
      (log, i) =>
        `<tr class="${i % 2 === 0 ? 'row-a' : 'row-b'}"><td>${escapeHtml(log.date)}</td><td>${escapeHtml(log.mealTitle || 'Scanned Meal')}</td><td class="num">${log.totalCalories} kcal</td></tr>`
    )
    .join('');

  const initial = (profile?.displayName || 'U').charAt(0).toUpperCase();

  function accuracyBar(pct: number | null): string {
    if (pct === null) return `<div class="bar-track"><div class="bar-empty">No data yet</div></div>`;
    const color = pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444';
    return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>`;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background: #F8FAFC;
          }
          .header {
            background: linear-gradient(135deg, #0F172A 0%, #312E81 100%);
            color: #FFFFFF;
            padding: 32px 36px;
          }
          .header h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.3px; }
          .header p { font-size: 12px; color: #C7D2FE; margin: 0; }
          .content { padding: 24px 36px 40px; }
          .profile-row { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
          .avatar {
            width: 44px; height: 44px; border-radius: 22px;
            background: #4F46E5; color: #FFFFFF;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; font-weight: 800;
          }
          .profile-name { font-size: 15px; font-weight: 800; color: #0F172A; }
          .profile-sub { font-size: 11px; color: #64748B; }
          .stat-row { display: flex; gap: 12px; margin-bottom: 28px; }
          .stat-card {
            flex: 1; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px;
            padding: 14px 16px;
          }
          .stat-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
          .stat-value { font-size: 22px; font-weight: 900; color: #0F172A; }
          .bar-track { background: #E2E8F0; border-radius: 6px; height: 8px; margin-top: 8px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 6px; }
          .bar-empty { font-size: 10px; color: #94A3B8; padding-top: 0; }
          section { margin-bottom: 28px; }
          h2 {
            font-size: 14px; font-weight: 800; color: #0F172A;
            margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #E0E7FF;
          }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; color: #64748B; font-weight: 700; padding: 6px 10px; font-size: 10px; text-transform: uppercase; }
          td { padding: 8px 10px; color: #1E293B; }
          .num { text-align: right; font-weight: 700; color: #4F46E5; }
          .row-a { background: #FFFFFF; }
          .row-b { background: #F8FAFC; }
          .meta-line { font-size: 11px; color: #64748B; margin-top: 8px; }
          .footer { text-align: center; font-size: 10px; color: #94A3B8; padding: 16px 36px 32px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LifeSync Data Report</h1>
          <p>Generated ${new Date().toLocaleString()} · Covers last ${ROUTINE_WINDOW_DAYS} days</p>
        </div>

        <div class="content">
          <div class="profile-row">
            <div class="avatar">${initial}</div>
            <div>
              <div class="profile-name">${escapeHtml(profile?.displayName || 'User')}</div>
              <div class="profile-sub">Joined ${joinedDate}</div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat-card">
              <div class="stat-label">Food Prediction Accuracy</div>
              <div class="stat-value">${foodAccuracy.accuracyPct !== null ? `${foodAccuracy.accuracyPct}%` : '—'}</div>
              ${accuracyBar(foodAccuracy.accuracyPct)}
              <div class="meta-line">${foodAccuracy.sampleCount} items cross-checked</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Habit Prediction Accuracy</div>
              <div class="stat-value">${habitAccuracy.accuracyPct !== null ? `${habitAccuracy.accuracyPct}%` : '—'}</div>
              ${accuracyBar(habitAccuracy.accuracyPct)}
              <div class="meta-line">${habitAccuracy.habitCount} habits compared</div>
            </div>
          </div>

          <section>
            <h2>Daily Routine — Habits (${habits.length})</h2>
            <table>
              <tr><th>Habit</th><th style="text-align:right;">Preferred Time</th></tr>
              ${habitRows || '<tr><td colspan="2">No habits yet.</td></tr>'}
            </table>
            <p class="meta-line">
              ${habitLogs.length} logged completions in the last ${ROUTINE_WINDOW_DAYS} days
              ${completionRatePct !== null ? `· ${completionRatePct}% completion rate` : ''}
            </p>
          </section>

          <section>
            <h2>Meals — last ${ROUTINE_WINDOW_DAYS} days (${foodLogs.length}, ${totalCalories.toLocaleString()} kcal total)</h2>
            <table>
              <tr><th>Date</th><th>Meal</th><th style="text-align:right;">Calories</th></tr>
              ${mealRows || '<tr><td colspan="3">No meals logged.</td></tr>'}
            </table>
          </section>
        </div>

        <div class="footer">Generated by LifeSync · Not medical advice</div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } else {
    await Share.share({ url: uri, title: 'LifeSync data report' });
  }
}

/**
 * Deletes every client-writable collection, the profile doc, then the Auth account itself.
 *
 * The `recommendations` subcollection is intentionally NOT touched here: firestore.rules makes
 * it server-write-only (see firestore-tests/rules.test.ts) so the client can't delete it either
 * — attempting to would just throw permission-denied. Those docs are keyed by habitId and become
 * permanently unreachable once the account and its habits are gone (no auth session can ever
 * read them again), which is harmless orphaned data, not a security gap.
 *
 * Firebase requires a *recent* sign-in for deleteUser — if the session is older, this throws
 * `auth/requires-recent-login`; callers should catch that specifically and ask the user to log
 * out and back in, rather than this function attempting a full re-authentication flow.
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  await Promise.all([deleteAllHabits(uid), deleteAllHabitLogs(uid), deleteAllHealthLogs(uid), deleteAllFoodLogs(uid)]);
  await deleteDoc(doc(db, 'users', uid));

  const currentUser = auth.currentUser;
  if (currentUser) {
    await deleteUser(currentUser);
  }
}
