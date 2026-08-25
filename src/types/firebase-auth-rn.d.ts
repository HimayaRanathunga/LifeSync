import type { Persistence } from '@firebase/auth';

/**
 * @firebase/auth's package.json lists a top-level "types" export that wins over its
 * "react-native" condition's own types during TS resolution (a known upstream gap — see
 * firebase/firebase-js-sdk#7584, #8332, #9316), so getReactNativePersistence resolves fine
 * at runtime via Metro but is invisible to tsc. This augmentation restores just that one type.
 */
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
