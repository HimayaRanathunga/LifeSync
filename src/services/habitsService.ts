import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Habit } from '../types';

const habitsCollection = (uid: string) => collection(db, 'users', uid, 'habits');

export function subscribeToHabits(uid: string, onChange: (habits: Habit[]) => void) {
  const q = query(habitsCollection(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const habits = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Habit);
    onChange(habits);
  });
}

/** One-shot read of every habit — used by exportService.ts, not a UI list (those subscribe live). */
export async function fetchAllHabits(uid: string): Promise<Habit[]> {
  const snapshot = await getDocs(habitsCollection(uid));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Habit);
}

export async function deleteAllHabits(uid: string): Promise<void> {
  const snapshot = await getDocs(habitsCollection(uid));
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export function addHabit(uid: string, habit: Omit<Habit, 'id' | 'createdAt'>) {
  return addDoc(habitsCollection(uid), { ...habit, createdAt: serverTimestamp() });
}

export function updateHabit(uid: string, habitId: string, changes: Partial<Habit>) {
  return updateDoc(doc(db, 'users', uid, 'habits', habitId), changes);
}

export function deleteHabit(uid: string, habitId: string) {
  return deleteDoc(doc(db, 'users', uid, 'habits', habitId));
}
