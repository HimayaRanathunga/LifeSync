import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from '@firebase/auth';
import { auth } from '../config/firebase';
import { syncPendingHealthWrites } from '../services/logsService';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Replays health increments that were recorded locally but never confirmed by the server — on
   * sign-in, and again whenever the app returns to the foreground, which is the point at which a
   * device that was offline has most likely regained connectivity.
   * See services/offlineQueue.ts for why the Firestore SDK cannot do this on its own here.
   */
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    syncPendingHealthWrites(uid).catch(() => {});

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncPendingHealthWrites(uid).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user]);

  const value: AuthContextValue = {
    user,
    initializing,
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    logOut: async () => {
      await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
