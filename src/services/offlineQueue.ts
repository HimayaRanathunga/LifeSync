import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Write-ahead log for health-metric increments.
 *
 * Why this exists: the Firestore JS SDK's persistent cache is IndexedDB-backed and therefore
 * unavailable in React Native, so the SDK's own retry queue lives only in memory. Worse, an
 * offline `setDoc` does not reject — its promise simply stays pending until the write reaches the
 * server — so a plain `.catch()` cannot detect the offline case at all. If the app is killed
 * while offline, the queued write disappears with no error ever surfacing.
 *
 * The fix is a durable log: record the increment in AsyncStorage *before* attempting the write,
 * and remove it only once the write actually resolves. Anything still in the log at next launch
 * is replayed.
 *
 * Known limitation: if the process is killed in the narrow window after the server commits a
 * write but before the resolve handler clears the log entry, that increment is applied twice on
 * replay. Making this exactly-once would need a server-side applied-ID set or a transaction per
 * flush; for a single-user daily counter the trade-off is not worth it, but the behaviour is
 * documented rather than hidden.
 */

const QUEUE_KEY = 'lifesync:pendingHealthWrites:v1';

export type HealthField = 'steps' | 'waterMl';

interface PendingWrite {
  id: string;
  uid: string;
  date: string; // "YYYY-MM-DD"
  field: HealthField;
  amount: number;
  queuedAt: number;
}

let nextLocalId = 0;
function makeId(): string {
  nextLocalId += 1;
  // Date.now() alone can collide when two increments land in the same millisecond.
  return `${Date.now()}-${nextLocalId}`;
}

async function readQueue(): Promise<PendingWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingWrite[]) : [];
  } catch {
    // A corrupt log must not brick the app — start clean rather than throwing on every write.
    return [];
  }
}

async function writeQueue(entries: PendingWrite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    // Storage failure means we lose durability for this increment, not correctness of the write
    // itself — the Firestore call still goes out.
  }
}

export async function enqueue(
  uid: string,
  date: string,
  field: HealthField,
  amount: number
): Promise<string> {
  const entry: PendingWrite = { id: makeId(), uid, date, field, amount, queuedAt: Date.now() };
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
  return entry.id;
}

export async function dequeue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((e) => e.id !== id));
}

/** Everything still awaiting confirmation, for this user only. */
export async function pendingFor(uid: string): Promise<PendingWrite[]> {
  const queue = await readQueue();
  return queue.filter((e) => e.uid === uid);
}

/**
 * Replays every unconfirmed increment for this user. `applyIncrement` is injected rather than
 * imported so this module has no dependency on logsService, which would otherwise be circular.
 *
 * Returns the number of entries confirmed. Entries whose write is still pending (offline again)
 * are left in the log for the next attempt.
 */
export async function flushPending(
  uid: string,
  applyIncrement: (date: string, field: HealthField, amount: number) => Promise<void>
): Promise<number> {
  const queue = await pendingFor(uid);
  if (queue.length === 0) return 0;

  let confirmed = 0;
  for (const entry of queue) {
    try {
      await applyIncrement(entry.date, entry.field, entry.amount);
      await dequeue(entry.id);
      confirmed += 1;
    } catch {
      // A rejection here is a permanent failure (rules, signed-out session), not an offline
      // pending state — dropping it stops the log growing without bound on an unfixable entry.
      await dequeue(entry.id);
    }
  }
  return confirmed;
}

/** Test/debug helper — clears the whole log regardless of user. */
export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}
