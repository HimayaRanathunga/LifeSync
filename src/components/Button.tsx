import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle, type PressableProps } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { springConfig } from '../theme/motion';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Button({ label, variant = 'primary', loading, disabled, style, onPressIn, onPressOut, ...pressableProps }: ButtonProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        pressable: { minHeight: 48 }, // comfortable touch target (WCAG 2.5.5 recommends >=44pt)
        base: {
          borderRadius: radius.md,
          paddingVertical: spacing.md + 2,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
        },
        disabled: { backgroundColor: colors.disabled },
        label: { color: colors.textOnPrimary, fontWeight: '600', fontSize: typography.subheader.fontSize },
        labelSecondary: { color: colors.primaryText },
        primary: { backgroundColor: colors.primary },
        secondary: { backgroundColor: colors.primarySurface },
        danger: { backgroundColor: colors.danger },
      }),
    [colors, radius, spacing, typography]
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={styles.pressable}
      disabled={isDisabled}
      onPressIn={(e) => {
        if (!isDisabled) scale.value = withSpring(0.96, springConfig);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, springConfig);
        onPressOut?.(e);
      }}
      {...pressableProps}
    >
      <Animated.View style={[styles.base, styles[variant], style, isDisabled && styles.disabled, animatedStyle]}>
        {loading ? (
          <ActivityIndicator color={variant === 'secondary' ? colors.primaryText : colors.textOnPrimary} />
        ) : (
          <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}
