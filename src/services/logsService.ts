import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  where,
  getDocs,
  increment,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { enqueue, dequeue, flushPending, type HealthField } from './offlineQueue';
import { db } from '../config/firebase';
import type { HabitLog, HealthLog } from '../types';

const logsCollection = (uid: string) => collection(db, 'users', uid, 'logs');
const healthCollection = (uid: string) => collection(db, 'users', uid, 'healthLogs');

/**
 * One document per habit per day, keyed deterministically.
 *
 * This previously used addDoc, so toggling a habit off and back on wrote a second document for
 * the same habit-day. That made the rendered tick depend on snapshot ordering (auto-IDs are
 * random, not monotonic), duplicated rows in the history list, and — worse — inflated the
 * attempt count the recommendation engine reads: `logs.length` crossing MIN_SAMPLES_FOR_ML early
 * on duplicates, and the same attempt counted twice in computeHourlySuccessRates.
 *
 * The key order matches the seeder (functions/src/seed/seedDatabase.ts) so seeded and
 * app-written rows resolve to the same document rather than fighting over the day.
 */
export function logHabitCompletion(uid: string, entry: Omit<HabitLog, 'id'>) {
  return setDoc(doc(logsCollection(uid), `${entry.habitId}_${entry.date}`), entry);
}

export function subscribeToHabitLogs(uid: string, onChange: (logs: HabitLog[]) => void) {
  const q = query(logsCollection(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitLog));
  });
}

/**
 * One doc per user per day, keyed by date string — replaces the old addDoc-per-save approach,
 * which created a duplicate healthLogs doc every time "Log today" was tapped and made "today's
 * total" unreliable to read.
 */
export function upsertHealthLog(uid: string, date: string, entry: Partial<Omit<HealthLog, 'id' | 'date'>>) {
  return setDoc(doc(healthCollection(uid), date), { date, ...entry }, { merge: true });
}

/** The bare Firestore write, with no durability log — used by the offline replay path itself. */
function applyHealthIncrement(uid: string, date: string, field: HealthField, amount: number) {
  return setDoc(doc(healthCollection(uid), date), { date, [field]: increment(amount) }, { merge: true });
}

/**
 * Records the increment in the durable write-ahead log before sending it, then clears the log
 * entry once the server confirms. An offline `setDoc` never rejects — it stays pending — so
 * without this an increment made offline is lost silently if the app is killed before it syncs.
 * See services/offlineQueue.ts.
 */
async function loggedIncrement(uid: string, date: string, field: HealthField, amount: number) {
  const entryId = await enqueue(uid, date, field, amount);
  await applyHealthIncrement(uid, date, field, amount);
  await dequeue(entryId);
}

/** Atomic +amountMl to today's water total (quick-add buttons) — creates today's doc if absent. */
export function incrementWaterMl(uid: string, date: string, amountMl: number) {
  return loggedIncrement(uid, date, 'waterMl', amountMl);
}

/** Atomic step-count accumulation — used on Android, where there's no device-side daily total. */
export function incrementSteps(uid: string, date: string, amount: number) {
  return loggedIncrement(uid, date, 'steps', amount);
}

/**
 * Replays any health increments that were recorded locally but never confirmed by the server —
 * call on sign-in and whenever the app returns to the foreground.
 */
export function syncPendingHealthWrites(uid: string): Promise<number> {
  return flushPending(uid, (date, field, amount) => applyHealthIncrement(uid, date, field, amount));
}

/** One-shot read of a single day's health doc — used as the Android step-count baseline (see useTodaySteps). */
export async function fetchHealthLog(uid: string, date: string): Promise<HealthLog | null> {
  const snap = await getDoc(doc(healthCollection(uid), date));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as HealthLog) : null;
}

/** Live subscription to a single day's health doc, addressable directly by date-as-doc-ID. */
export function subscribeToTodayHealthLog(
  uid: string,
  date: string,
  onChange: (log: HealthLog | null) => void
): Unsubscribe {
  return onSnapshot(doc(healthCollection(uid), date), (snap) => {
    onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as HealthLog) : null);
  });
}

export interface Page<T> {
  items: T[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * One-time, cursor-paginated read (not a live subscription) — history lists can grow without
 * bound over months of use, so loading the whole collection on every screen open would be
 * wasteful reads/bandwidth. Pass the previous page's `cursor` to fetch the next page.
 */
/**
 * habitId is filtered server-side (`where`), not client-side after fetching — filtering a page
 * of mixed-habit logs down to one habit after the fact would desync the pagination cursor from
 * what "hasMore" actually means (a full raw page could still filter down to zero matching rows,
 * or a page that looks exhausted could still have more matches beyond it).
 */
export async function fetchHabitLogsPage(
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  habitId?: string
): Promise<Page<HabitLog>> {
  const base = habitId ? [where('habitId', '==', habitId), orderBy('date', 'desc')] : [orderBy('date', 'desc')];
  const constraints = cursor ? [...base, startAfter(cursor), limit(pageSize)] : [...base, limit(pageSize)];
  const snapshot = await getDocs(query(logsCollection(uid), ...constraints));
  return {
    items: snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitLog),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

/**
 * Bounded window read (not the unbounded subscribeToHabitLogs) for the Dashboard's streak badge
 * — a range filter plus orderBy on the same field (`date`) needs no composite index.
 */
export async function fetchRecentHabitLogs(uid: string, sinceDate: string): Promise<HabitLog[]> {
  const q = query(logsCollection(uid), where('date', '>=', sinceDate), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitLog);
}

/** Bounded window read for the Dashboard's weekly trend sparklines — same no-composite-index reasoning as above. */
export async function fetchRecentHealthLogs(uid: string, sinceDate: string): Promise<HealthLog[]> {
  const q = query(healthCollection(uid), where('date', '>=', sinceDate), orderBy('date'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HealthLog);
}

export async function fetchHealthLogsPage(
  uid: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<Page<HealthLog>> {
  const constraints = cursor
    ? [orderBy('date', 'desc'), startAfter(cursor), limit(pageSize)]
    : [orderBy('date', 'desc'), limit(pageSize)];
  const snapshot = await getDocs(query(healthCollection(uid), ...constraints));
  return {
    items: snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HealthLog),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

// --- One-shot full reads/deletes for exportService.ts. A single unbounded getDocs is fine here
// (unlike the paginated/bounded reads above, which guard against repeated-read cost on screens
// that re-open often) because these only ever run once, on an explicit user button press.

export async function fetchAllHabitLogs(uid: string): Promise<HabitLog[]> {
  const snapshot = await getDocs(logsCollection(uid));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitLog);
}

export async function deleteAllHabitLogs(uid: string): Promise<void> {
  const snapshot = await getDocs(logsCollection(uid));
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function fetchAllHealthLogs(uid: string): Promise<HealthLog[]> {
  const snapshot = await getDocs(healthCollection(uid));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HealthLog);
}

export async function deleteAllHealthLogs(uid: string): Promise<void> {
  const snapshot = await getDocs(healthCollection(uid));
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
