import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { motionDurations } from '../theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  strokeLinecap?: 'round' | 'butt';
  animated?: boolean;
  duration?: number;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}

// Pure visual primitive, same philosophy as GlassCard — no baked-in background/padding, callers
// place it inside whatever container (GlassCard/Card/bare layout) fits the screen.
export default function CircularProgress({
  value,
  max = 1,
  size = 96,
  strokeWidth = 10,
  color,
  trackColor,
  strokeLinecap = 'round',
  animated = true,
  duration = motionDurations.entrance,
  children,
  accessibilityLabel,
}: CircularProgressProps) {
  const { colors } = useTheme();
  const progressColor = color ?? colors.primary;
  const trackColorResolved = trackColor ?? colors.border;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(max === 0 ? 0 : value / max, 0), 1);

  const progress = useSharedValue(animated ? 0 : clamped);

  useEffect(() => {
    progress.value = animated
      ? withTiming(clamped, { duration, easing: Easing.out(Easing.cubic) })
      : clamped;
  }, [clamped, animated, duration, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColorResolved}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeLinecap={strokeLinecap}
          animatedProps={animatedProps}
        />
      </Svg>
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute', top: 0, left: 0, transform: [{ rotate: '-90deg' }] },
  content: { alignItems: 'center', justifyContent: 'center' },
});
