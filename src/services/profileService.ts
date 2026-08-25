import { doc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailyGoals, Goal, UserProfile } from '../types';

export function subscribeToUserProfile(uid: string, onChange: (profile: UserProfile | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    onChange(snap.exists() ? (snap.data() as UserProfile) : null);
  });
}

export function updateDailyGoals(uid: string, goals: DailyGoals) {
  return setDoc(doc(db, 'users', uid), { dailyGoals: goals }, { merge: true });
}

export interface ProfileDetails {
  wakeTime: string;
  workStart: string;
  workEnd: string;
  goals: Goal[];
}

export function updateProfileDetails(uid: string, details: ProfileDetails) {
  return setDoc(doc(db, 'users', uid), details, { merge: true });
}

export function updateNotificationsEnabled(uid: string, enabled: boolean) {
  return setDoc(doc(db, 'users', uid), { notificationsEnabled: enabled }, { merge: true });
}

export function updateBodyMeasurements(uid: string, heightCm: number, weightKg: number) {
  return setDoc(doc(db, 'users', uid), { heightCm, weightKg }, { merge: true });
}
