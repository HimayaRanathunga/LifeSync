import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { motionDurations } from '../theme/motion';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightAction?: React.ReactNode;
}

export default function TextField({
  label,
  error,
  icon,
  rightAction,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);
  const focusProgress = useSharedValue(0);

  useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: motionDurations.base });
  }, [isFocused, focusProgress]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { gap: spacing.xs },
        label: {
          fontSize: typography.label.fontSize,
          fontWeight: typography.label.fontWeight,
          color: isFocused ? colors.primaryText : colors.textSecondary,
        },
        inputWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1.5,
          backgroundColor: colors.background,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          minHeight: 50,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
          elevation: isFocused ? 2 : 0,
        },
        icon: {
          marginRight: spacing.sm,
        },
        input: {
          flex: 1,
          paddingVertical: spacing.md,
          fontSize: typography.body.fontSize,
          color: colors.textPrimary,
        },
        eyeButton: {
          padding: spacing.xs,
          marginLeft: spacing.xs,
        },
        error: {
          fontSize: typography.caption.fontSize,
          color: colors.dangerText,
          marginTop: 2,
          fontWeight: '500',
        },
      }),
    [colors, radius, spacing, typography, isFocused]
  );

  const animatedWrapperStyle = useAnimatedStyle(
    () => ({
      borderColor: error
        ? colors.danger
        : interpolateColor(focusProgress.value, [0, 1], [colors.border, colors.primary]),
      shadowOpacity: focusProgress.value * 0.12,
    }),
    [colors, error]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.inputWrapper, animatedWrapperStyle]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={error ? colors.danger : isFocused ? colors.primary : colors.textMuted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          secureTextEntry={secureTextEntry ? !isPasswordVisible : false}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsPasswordVisible((v) => !v)}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : rightAction ? (
          rightAction
        ) : null}
      </Animated.View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
