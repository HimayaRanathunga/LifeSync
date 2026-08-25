import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface QuickActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

/** Icon-over-label pill — distinct from Button.tsx's text-only style, used for the Dashboard's quick-action row. */
export default function QuickActionButton({ icon, label, onPress }: QuickActionButtonProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          backgroundColor: colors.primarySurface,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
          minHeight: 64,
        },
        pressed: { opacity: 0.8 },
        label: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.primaryText },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.base, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.primaryText} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
