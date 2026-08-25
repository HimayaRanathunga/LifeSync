import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface CircularProgressRingProps {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0 to 1
  leftLabel?: string;
  leftValue?: string | number;
  ringColor?: string;
  trackColor?: string;
  textColor?: string;
}

export default function CircularProgressRing({
  size = 92,
  strokeWidth = 9,
  progress = 0.65,
  leftLabel = 'Left',
  leftValue = '520',
  ringColor = '#134E4A',
  trackColor = '#E2E8F0',
  textColor = '#0F172A',
}: CircularProgressRingProps) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const strokeDashoffset = circumference - clampedProgress * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Track Circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.textContainer}>
        <Text style={[styles.valueText, { color: textColor }]}>{leftValue}</Text>
        <Text style={styles.labelText}>{leftLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: -2,
    textTransform: 'uppercase',
  },
});
