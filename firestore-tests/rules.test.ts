/**
 * Security rules tests for ../firestore.rules, run against the local Firebase Emulator
 * (never against production — see README.md "Running these tests").
 *
 * Covers the per-user data isolation the Security & Performance rubric criterion asks for:
 * unauthenticated access is denied, users can only read/write their own data, and the
 * `recommendations` subcollection (computed server-side by the Cloud Function) is
 * client-read-only.
 */
import * as fs from 'fs';
import * as path from 'path';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-lifesync',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

describe('unauthenticated access', () => {
  it('cannot read another user profile', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), 'users', ALICE)));
  });

  it('cannot write a habit', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(unauthed.firestore(), 'users', ALICE, 'habits', 'h1'), { title: 'Run', preferredTime: '07:00' })
    );
  });
});

describe('owner access to their own data', () => {
  it('can read and write their own profile', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    await assertSucceeds(setDoc(doc(alice.firestore(), 'users', ALICE), { displayName: 'Alice' }));
    await assertSucceeds(getDoc(doc(alice.firestore(), 'users', ALICE)));
  });

  it('can create, read, and delete their own habit', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    const habitRef = doc(alice.firestore(), 'users', ALICE, 'habits', 'h1');
    await assertSucceeds(setDoc(habitRef, { title: 'Run', preferredTime: '07:00' }));
    await assertSucceeds(getDoc(habitRef));
    await assertSucceeds(deleteDoc(habitRef));
  });

  it('can write their own health log and food log', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users', ALICE, 'healthLogs', 'log1'), { date: '2026-08-17', sleepHours: 7 })
    );
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users', ALICE, 'foodLogs', 'food1'), { date: '2026-08-17', totalCalories: 500 })
    );
  });
});

describe('cross-user isolation', () => {
  it('cannot read another user profile', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    await assertFails(getDoc(doc(alice.firestore(), 'users', BOB)));
  });

  it('cannot read another user habit', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', BOB, 'habits', 'h1'), { title: 'Bob habit' });
    });

    const alice = testEnv.authenticatedContext(ALICE);
    await assertFails(getDoc(doc(alice.firestore(), 'users', BOB, 'habits', 'h1')));
  });

  it('cannot write another user habit', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    await assertFails(setDoc(doc(alice.firestore(), 'users', BOB, 'habits', 'h1'), { title: 'Hijacked' }));
  });

  it('cannot delete another user food log', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', BOB, 'foodLogs', 'food1'), { totalCalories: 500 });
    });

    const alice = testEnv.authenticatedContext(ALICE);
    await assertFails(deleteDoc(doc(alice.firestore(), 'users', BOB, 'foodLogs', 'food1')));
  });
});

describe('recommendations subcollection is server-write-only', () => {
  it('owner can read a recommendation seeded by the (trusted, Admin SDK) Cloud Function', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ALICE, 'recommendations', 'habit1'), {
        suggestedTime: '07:00',
        score: 0.8,
      });
    });

    const alice = testEnv.authenticatedContext(ALICE);
    await assertSucceeds(getDoc(doc(alice.firestore(), 'users', ALICE, 'recommendations', 'habit1')));
  });

  it('owner cannot write their own recommendation directly from the client', async () => {
    const alice = testEnv.authenticatedContext(ALICE);
    await assertFails(
      setDoc(doc(alice.firestore(), 'users', ALICE, 'recommendations', 'habit1'), { suggestedTime: '09:00', score: 1 })
    );
  });
});
