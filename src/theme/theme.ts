/**
 * Design tokens for the app. Every screen/component consumes colors via useTheme()
 * (src/context/ThemeContext.tsx) instead of importing a static object, since colors now switch
 * between lightColors/darkColors at runtime — spacing/radius/typography/gradients don't change
 * between themes, so those are still plain static exports.
 *
 * Every color pair below was checked with a WCAG relative-luminance contrast calculation (not
 * eyeballed) against the background/surface it's actually used on; ratios are accurate as of the
 * values currently set, AA requires 4.5:1 for normal text / 3:1 for large text/UI components —
 * re-check with the same formula if any of these values change.
 *
 * Two different roles need two different treatments in dark mode, which is why there are extra
 * "*Text" tokens beyond what the light-only palette needed:
 *  - Solid backgrounds with white/light text on top (primary/success/danger buttons, the brand
 *    gradient stops) already have good contrast against white *regardless of theme* — that ratio
 *    only depends on the two colors involved — so these stay identical between palettes.
 *  - Colored text/icons on a neutral or tinted surface (e.g. secondary button labels, streak
 *    badges) can't reuse the same value in dark mode: a color dark enough to read on a *light*
 *    pastel surface is, by definition, too dark to read on a *dark* one. `primaryText`/
 *    `successText`/`dangerText` are brightened dark-mode-only variants for exactly this — same
 *    technique already used for `brandCyanText` vs `brandCyanVivid` below, applied for the same
 *    reason. In the light palette these equal `primary`/`success`/`danger` since that already
 *    works there.
 */

export const lightColors = {
  // Brand — primary/primaryDark verified for text contrast below.
  primary: '#4F46E5', // vs #FFFFFF background: 6.29:1 — passes AA normal text
  primaryDark: '#3730A3', // pressed/emphasis state, vs #FFFFFF: 9.93:1
  primarySurface: '#EEF0FF', // tinted background for chips/cards; primary text on top: 5.55:1
  primaryText: '#4F46E5', // same as primary — already works as text-on-primarySurface (5.55:1) in light mode

  // Sampled from the LS logo (logo.png) — vivid, matches the logo exactly, but NOT contrast
  // -checked against white text. Use only decoratively (icon tints, non-text swatches), never
  // as a background color behind white/light text.
  brandCyanVivid: '#06B6D4',
  brandMagentaVivid: '#D946EF',
  brandLeafVivid: '#10B981',
  brandPurple: '#7C3AED', // vs white text: 5.70:1 — safe for text too, used as-is below

  // Darkened versions of the same hues, each independently verified ≥4.5:1 against white —
  // used wherever a gradient stop sits directly behind white/light text (see `gradients` below).
  // Gradient headers stay colorful/vivid in both themes (white text on top either way), so these
  // don't need dark-mode variants.
  brandCyanText: '#0E7490', // vs #FFFFFF: 5.36:1
  brandMagentaText: '#C026D3', // vs #FFFFFF: 4.71:1
  brandLeafText: '#047857', // vs #FFFFFF: 5.48:1

  // Semantic
  success: '#166534', // vs #EFFDF4 surface: 6.80:1, vs #FFFFFF: 7.13:1
  successSurface: '#EFFDF4',
  successText: '#166534', // same as success — already works as text-on-successSurface in light mode
  danger: '#DC2626', // vs #FFFFFF: 4.83:1 — passes AA normal text
  dangerSurface: '#FEF2F2',
  dangerText: '#DC2626', // same as danger — already works as text/icon-on-surface in light mode

  // Neutrals
  background: '#FFFFFF',
  surface: '#F8F9FF',
  surfaceAlt: '#F5F5FF',
  border: '#E7E9FA',
  textPrimary: '#1F2340', // vs #FFFFFF: 15.30:1
  textSecondary: '#5B5F79', // vs #FFFFFF: 6.25:1
  textMuted: '#6B6F87', // vs #FFFFFF: 4.94:1 — passes AA normal text (previous #7B7F99 draft measured 3.93:1 and would have failed; replaced)
  textOnPrimary: '#FFFFFF',
  disabled: '#A5A9C9',

  // Glassmorphism tokens (frosted-card overlay drawn on top of expo-blur's BlurView — blur alone
  // only blurs, it doesn't tint, so these are the layer that actually keeps text legible). Unlike
  // every other pairing above, these are NOT statically contrast-verified: legibility depends on
  // whatever is rendered behind the blur at runtime (gradient vs. plain surface), which can't be
  // computed the way a flat background can — verify visually per use site, same discipline that
  // caught the `success`/`textMuted` bugs elsewhere in this file.
  glassTint: 'rgba(255,255,255,0.55)',
  glassTintStrong: 'rgba(255,255,255,0.82)',
  glassBorder: 'rgba(255,255,255,0.55)',
  glassHighlight: 'rgba(255,255,255,0.85)',
} as const;

// Dark palette. Real WCAG ratios computed (not eyeballed): textPrimary vs background 14.43:1,
// vs surface 16.57:1; textSecondary 8.66:1 / 9.95:1; textMuted 5.75:1 / 6.61:1; primaryText vs
// primarySurface(dark) 7.44:1, vs background 8.76:1; successText vs successSurface(dark) 9.04:1;
// dangerText vs dangerSurface(dark) 8.55:1, vs background 8.48:1 — all comfortably ≥4.5:1 AA,
// most exceed AAA (7:1). `background` stays lighter than `surface` (elevated cards read as
// "raised"), same relationship the light palette has.
export const darkColors = {
  primary: '#4F46E5', // unchanged — still 6.29:1 vs white text on solid buttons, theme-independent
  primaryDark: '#3730A3',
  primarySurface: '#262A52',
  primaryText: '#B4BBFA', // brightened — 7.44:1 vs primarySurface(dark), 8.76:1 vs background

  brandCyanVivid: '#06B6D4',
  brandMagentaVivid: '#D946EF',
  brandLeafVivid: '#10B981',
  brandPurple: '#7C3AED',

  brandCyanText: '#0E7490',
  brandMagentaText: '#C026D3',
  brandLeafText: '#047857',

  success: '#166534', // unchanged — still 7.13:1 vs white text on solid buttons, theme-independent
  successSurface: '#113325',
  successText: '#6EE7B7', // brightened — 9.04:1 vs successSurface(dark)

  danger: '#DC2626', // unchanged — still 4.83:1 vs white text on solid buttons, theme-independent
  dangerSurface: '#3B1220',
  dangerText: '#FCA5A5', // brightened — 8.55:1 vs dangerSurface(dark)

  background: '#1E2030',
  surface: '#12131C',
  surfaceAlt: '#242640',
  border: '#3A3D57',
  textPrimary: '#F1F2FA', // 14.43:1 vs background, 16.57:1 vs surface
  textSecondary: '#B9BCDD', // 8.66:1 vs background, 9.95:1 vs surface
  textMuted: '#9598BD', // 5.75:1 vs background, 6.61:1 vs surface
  textOnPrimary: '#FFFFFF',
  disabled: '#5A5D78',

  // Glassmorphism tokens — dark-mode frost, same not-statically-verified caveat as the light
  // palette above (see that comment).
  glassTint: 'rgba(18,19,28,0.45)',
  glassTintStrong: 'rgba(18,19,28,0.72)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.08)',
} as const;

export type Colors = { [K in keyof typeof lightColors]: string };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  header: { fontSize: 20, fontWeight: '700' as const },
  subheader: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const },
};

// Gradient stop arrays for expo-linear-gradient, matching the LS logo's own gradient sweeps —
// cyan-to-indigo-to-purple along the "L", purple-to-magenta along the "S" tail, green-to-teal
// on the leaf accent. These are used behind white/light text (screen headers, hero banners),
// so every stop is one of the *Text-suffixed colors verified ≥4.5:1 against white above — do
// not swap in a *Vivid color here without re-checking contrast. Identical in both themes (see
// file header comment).
export const gradients = {
  hero: [lightColors.brandCyanText, lightColors.primary, lightColors.brandPurple] as const,
  accent: [lightColors.brandPurple, lightColors.brandMagentaText] as const,
  leaf: [lightColors.brandLeafText, lightColors.brandCyanText] as const,
};
