import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';

interface GlassCardProps extends ViewProps {
  /** BlurView intensity, 1-100. */
  intensity?: number;
  /** Controls the default radius/border preset. */
  variant?: 'card' | 'pill';
  /** Use the stronger, more opaque frost tint (for primary content surfaces). */
  strong?: boolean;
  children: React.ReactNode;
}

// Pure visual chrome — a frosted-glass surface (BlurView + tint layer) with no baked-in
// padding/layout/animation opinions, so callers keep owning their own spacing and any entrance
// choreography (see useEntranceAnimation). Composition: BlurView (blur only, no tint) -> a
// semi-transparent tinted View (the layer that actually preserves text legibility) -> children.
export default function GlassCard({
  intensity = 40,
  variant = 'card',
  strong = false,
  style,
  children,
  ...viewProps
}: GlassCardProps) {
  const { colors, radius, isDark } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.glassBorder,
          borderRadius: variant === 'pill' ? radius.pill : radius.xl + 4,
        },
        fill: StyleSheet.absoluteFillObject,
        tint: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: strong ? colors.glassTintStrong : colors.glassTint,
        },
        content: {},
      }),
    [colors, radius, variant, strong]
  );

  return (
    <View style={[styles.outer, style]} {...viewProps}>
      <BlurView
        style={styles.fill}
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' as const } : {})}
      />
      <View style={styles.tint} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}
