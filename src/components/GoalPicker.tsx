import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { Goal } from '../types';

interface GoalOption {
  value: Goal;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    value: 'fitness',
    label: 'Fitness & Physical Stamina',
    subtitle: 'Daily workouts, hydration & movement',
    icon: 'barbell',
    color: '#EA580C',
    bg: '#FFEDD5',
  },
  {
    value: 'study',
    label: 'Study & Deep Work',
    subtitle: 'Focused learning, coding & research',
    icon: 'book',
    color: '#7C3AED',
    bg: '#EDE9FE',
  },
  {
    value: 'work-life-balance',
    label: 'Work-Life Harmony & Recovery',
    subtitle: 'Mindfulness, sleep hygiene & rest',
    icon: 'flower',
    color: '#059669',
    bg: '#D1FAE5',
  },
];

interface GoalPickerProps {
  value: Goal[];
  onChange: (goals: Goal[]) => void;
}

export default function GoalPicker({ value, onChange }: GoalPickerProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { gap: spacing.sm },
        label: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        sublabel: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: -4,
          marginBottom: 4,
        },
        labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        goalsGrid: { gap: spacing.sm },
        goalCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        goalCardSelected: {
          borderColor: colors.primary,
          backgroundColor: colors.primarySurface,
        },
        iconBox: {
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        goalTextCol: { flex: 1, gap: 2 },
        goalTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        goalSubtitle: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
        checkCircle: {
          width: 24,
          height: 24,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
        checkCircleSelected: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
      }),
    [colors, radius, spacing, typography]
  );

  const toggleGoal = (goal: Goal) => {
    onChange(value.includes(goal) ? value.filter((g) => g !== goal) : [...value, goal]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="flag" size={14} color={colors.textPrimary} />
        <Text style={styles.label}>Select Your Key Life Goals</Text>
      </View>
      <Text style={styles.sublabel}>Pick one or more areas you want the ML algorithm to optimize for you.</Text>
      <View style={styles.goalsGrid}>
        {GOAL_OPTIONS.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <Pressable
              key={opt.value}
              style={[styles.goalCard, selected && styles.goalCardSelected]}
              onPress={() => toggleGoal(opt.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={opt.label}
            >
              <View style={[styles.iconBox, { backgroundColor: opt.bg }]}>
                <Ionicons name={opt.icon} size={20} color={opt.color} />
              </View>
              <View style={styles.goalTextCol}>
                <Text style={styles.goalTitle}>{opt.label}</Text>
                <Text style={styles.goalSubtitle}>{opt.subtitle}</Text>
              </View>
              <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                {selected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

