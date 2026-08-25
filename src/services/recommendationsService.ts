import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Recommendation } from '../types';

// Recommendations are computed server-side by the scheduled Cloud Function
// (see /functions/src/index.ts) and written to this collection — the client only reads.
const recommendationsCollection = (uid: string) => collection(db, 'users', uid, 'recommendations');

export function subscribeToRecommendations(uid: string, onChange: (recs: Recommendation[]) => void) {
  const q = query(recommendationsCollection(uid), orderBy('score', 'desc'));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data() as Recommendation));
  });
}

/** One-shot read of every recommendation — used by the PDF export report, not a live UI list. */
export async function fetchAllRecommendations(uid: string): Promise<Recommendation[]> {
  const snapshot = await getDocs(recommendationsCollection(uid));
  return snapshot.docs.map((d) => d.data() as Recommendation);
}
