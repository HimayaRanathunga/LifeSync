/**
 * Local-calendar date keys.
 *
 * Every `date` field in Firestore ("YYYY-MM-DD") is meant to be the user's *local* calendar day.
 * The obvious-looking `new Date().toISOString().slice(0, 10)` is UTC, which is a different day for
 * most of the world: at UTC+5:30, local midnight is 18:30 UTC the *previous* day, so a value built
 * from a local-midnight Date and then formatted via toISOString() is off by one all day, not just
 * near the boundary.
 *
 * Use toDateKey() anywhere a date string is written to or read from Firestore, so the client and
 * the Cloud Functions agree on which day a log belongs to.
 */
export function toDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a "YYYY-MM-DD" key back into a Date at local midnight (not UTC midnight). */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
