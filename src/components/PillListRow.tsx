import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import GlassCard from './GlassCard';

interface PillListRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackgroundColor?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

// Color-coded pill row built on GlassCard — the color-coding comes through as the icon-circle
// fill sitting on the glass chrome, not a solid pastel row background, so it stays glass rather
// than reproducing the flat/pastel reference-image look directly.
export default function PillListRow({
  icon,
  iconColor,
  iconBackgroundColor,
  title,
  subtitle,
  trailing,
  onPress,
  style,
}: PillListRowProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          gap: spacing.md,
        },
        iconCircle: {
          width: 40,
          height: 40,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconBackgroundColor ?? colors.primarySurface,
        },
        textCol: { flex: 1, gap: 1 },
        title: { ...typography.subheader, color: colors.textPrimary },
        subtitle: { ...typography.caption, color: colors.textSecondary },
        trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
      }),
    [colors, radius, spacing, typography, iconBackgroundColor]
  );

  const content = (
    <View style={styles.row}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
        <GlassCard variant="pill" style={style}>
          {content}
        </GlassCard>
      </Pressable>
    );
  }

  return (
    <GlassCard variant="pill" style={style}>
      {content}
    </GlassCard>
  );
}
