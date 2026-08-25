// Plain numeric constants only — deliberately no `react-native-reanimated` import here, so this
// file stays as framework-agnostic as theme.ts, since ThemeContext (and by extension anything
// that imports theme tokens) is consumed by every screen, including ones that never animate.
// Actual Easing curves / worklets are constructed inline in the components that need them.

export const motionDurations = {
  fast: 150,
  base: 250,
  slow: 400,
  entrance: 550,
  stagger: 80, // ms delay increment between staggered list/field entrances
} as const;

export const springConfig = {
  damping: 15,
  stiffness: 180,
  mass: 0.9,
} as const;
