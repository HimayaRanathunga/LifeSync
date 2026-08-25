import { initializeApp, getApps, getApp } from 'firebase/app';
// Imported from '@firebase/auth' directly, not 'firebase/auth': the 'firebase' wrapper
// package's export map has no "react-native" condition, so it silently resolves to the
// browser build and drops getReactNativePersistence. '@firebase/auth' has the RN condition.
import { initializeAuth, getReactNativePersistence, getAuth, type Auth } from '@firebase/auth';
import { initializeFirestore, getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.warn(
    'Firebase config is missing. Copy .env.example to .env and fill in your Firebase project values.'
  );
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth/initializeFirestore throw if called twice (e.g. on Fast Refresh) — fall back to the existing instance.
let auth: Auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  auth = getAuth(app);
}

let db: Firestore;
try {
  db = initializeFirestore(app, {
    // Force long-polling rather than auto-detecting it.
    //
    // Firestore's default transport is WebChannel over streaming fetch. In React Native that
    // stream can be established and then silently stall: writes sit pending forever and snapshot
    // listeners never fire a first result — no error is thrown, so `await setDoc(...)` simply
    // never settles. `experimentalAutoDetectLongPolling` is meant to notice this and fall back,
    // but the detection itself relies on the same transport and frequently does not fire.
    //
    // Forcing long-polling trades a little latency for a connection that actually completes.
    // Verified against this project: the identical write succeeds from Node (default transport)
    // while hanging indefinitely in Expo Go until this flag was set.
    experimentalForceLongPolling: true,
  });
} catch {
  db = getFirestore(app);
}

export { auth, db };
export const storage = getStorage(app);
export const functions = getFunctions(app);
