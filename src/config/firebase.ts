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
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  db = getFirestore(app);
}

export { auth, db };
export const storage = getStorage(app);
export const functions = getFunctions(app);
