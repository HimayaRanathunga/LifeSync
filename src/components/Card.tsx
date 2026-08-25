import React, { useMemo } from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface CardProps extends ViewProps {
  variant?: 'surface' | 'tint' | 'success' | 'elevated';
}

export default function Card({ variant = 'surface', style, ...viewProps }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: { borderRadius: radius.lg, padding: spacing.lg },
        surface: { backgroundColor: colors.surface },
        tint: { backgroundColor: colors.primarySurface },
        success: { backgroundColor: colors.successSurface },
        // white/dark-elevated card popping off the tinted screen background, with a soft shadow
        elevated: {
          backgroundColor: colors.background,
          shadowColor: colors.textPrimary,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
      }),
    [colors, radius, spacing]
  );

  return <View style={[styles.base, styles[variant], style]} {...viewProps} />;
}
