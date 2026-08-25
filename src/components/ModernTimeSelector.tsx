import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export interface TimePreset {
  label: string;
  time: string;
}

interface ModernTimeSelectorProps {
  label: string;
  value: string; // 24h format "HH:mm"
  onChange: (time: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  presets?: TimePreset[];
  stepMinutes?: number;
  description?: string;
}

const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function parse24Hour(time24: string): { hour12: string; minute: string; period: 'AM' | 'PM' } {
  if (!time24 || !time24.includes(':')) return { hour12: '08', minute: '00', period: 'AM' };
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return { hour12: '08', minute: '00', period: 'AM' };

  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;

  const hour12 = h < 10 ? '0' + h : String(h);
  const minute = m < 10 ? '0' + m : String(m);
  return { hour12, minute, period };
}

export function to24Hour(hour12: string, minute: string, period: 'AM' | 'PM'): string {
  let h = parseInt(hour12, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h)) h = 8;
  if (isNaN(m)) h = 0;

  if (period === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  const padH = h < 10 ? '0' + h : String(h);
  const padM = m < 10 ? '0' + m : String(m);
  return padH + ':' + padM;
}

export function formatTo12Hour(time24: string): string {
  const { hour12, minute, period } = parse24Hour(time24);
  return hour12 + ':' + minute + ' ' + period;
}

export function adjustTime(time24: string, deltaMinutes: number): string {
  if (!time24 || !time24.includes(':')) return '08:00';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return '08:00';

  let totalMins = h * 60 + m + deltaMinutes;
  totalMins = (totalMins + 1440) % 1440;

  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;

  const padH = newH < 10 ? '0' + newH : String(newH);
  const padM = newM < 10 ? '0' + newM : String(newM);
  return padH + ':' + padM;
}

export default function ModernTimeSelector({
  label,
  value,
  onChange,
  icon = 'time-outline',
  presets = [],
  stepMinutes = 15,
  description,
}: ModernTimeSelectorProps) {
  const { colors, radius, spacing } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const parsed = useMemo(() => parse24Hour(value), [value]);
  const [selectedHour, setSelectedHour] = useState(parsed.hour12);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(parsed.period);

  const openPicker = () => {
    const p = parse24Hour(value);
    setSelectedHour(p.hour12);
    // Find closest minute in presets or keep raw
    setSelectedMinute(p.minute);
    setSelectedPeriod(p.period);
    setModalVisible(true);
  };

  const handleConfirm = () => {
    const new24 = to24Hour(selectedHour, selectedMinute, selectedPeriod);
    onChange(new24);
    setModalVisible(false);
  };

  const formatted12h = useMemo(() => formatTo12Hour(value), [value]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.background,
          borderRadius: radius.xl,
          padding: spacing.md + 2,
          borderWidth: 1.5,
          borderColor: colors.border,
          gap: spacing.sm,
          shadowColor: colors.textPrimary,
          shadowOpacity: 0.04,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 1,
        },
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        labelRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        label: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        description: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: -2,
        },
        timeBoxRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.sm,
          borderWidth: 1,
          borderColor: colors.border,
          marginTop: 2,
        },
        stepperBtn: {
          backgroundColor: colors.background,
          width: 40,
          height: 40,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
        },
        timeDisplayBtn: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 4,
          paddingHorizontal: spacing.sm,
        },
        timeText: {
          fontSize: 20,
          fontWeight: '900',
          color: colors.primaryText,
          letterSpacing: 0.5,
        },
        timeSubRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 2,
        },
        timeSub: {
          fontSize: 10,
          fontWeight: '700',
          color: colors.primary,
          textTransform: 'uppercase',
        },
        presetsScroll: {
          marginTop: 2,
        },
        presetsRow: {
          flexDirection: 'row',
          gap: 6,
          paddingVertical: 2,
        },
        presetChip: {
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        presetChipActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        presetText: {
          fontSize: 12,
          fontWeight: '700',
          color: colors.textSecondary,
        },
        presetTextActive: {
          color: colors.textOnPrimary,
        },

        // Modal Styles
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end',
        },
        modalContent: {
          backgroundColor: colors.background,
          borderTopLeftRadius: radius.xl + 8,
          borderTopRightRadius: radius.xl + 8,
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
          gap: spacing.md,
          maxHeight: '85%',
        },
        modalHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingBottom: spacing.sm,
        },
        modalTitle: {
          fontSize: 17,
          fontWeight: '800',
          color: colors.textPrimary,
        },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        previewCard: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySurface,
          borderRadius: radius.xl,
          padding: spacing.md,
          gap: spacing.sm,
          borderWidth: 1.5,
          borderColor: colors.primary + '30',
        },
        previewDigits: {
          fontSize: 32,
          fontWeight: '900',
          color: colors.primaryText,
          letterSpacing: 1,
        },
        ampmToggleRow: {
          flexDirection: 'row',
          gap: 6,
          marginLeft: spacing.sm,
        },
        ampmPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.background,
          borderWidth: 1.5,
          borderColor: colors.border,
        },
        ampmPillActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        ampmText: {
          fontSize: 13,
          fontWeight: '800',
          color: colors.textSecondary,
        },
        ampmTextActive: {
          color: colors.textOnPrimary,
        },
        gridSection: {
          gap: 6,
        },
        gridSectionTitle: {
          fontSize: 13,
          fontWeight: '700',
          color: colors.textPrimary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        chipsGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
        },
        timeChipItem: {
          width: '23%',
          paddingVertical: 10,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        timeChipItemActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        timeChipItemText: {
          fontSize: 14,
          fontWeight: '800',
          color: colors.textPrimary,
        },
        timeChipItemTextActive: {
          color: colors.textOnPrimary,
        },
        modalActionsRow: {
          flexDirection: 'row',
          gap: spacing.md,
          marginTop: spacing.xs,
        },
        cancelModalBtn: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cancelModalBtnText: {
          fontSize: 14,
          fontWeight: '700',
          color: colors.textSecondary,
        },
        confirmModalBtn: {
          flex: 2,
          flexDirection: 'row',
          gap: 6,
          paddingVertical: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        },
        confirmModalBtnText: {
          fontSize: 14,
          fontWeight: '800',
          color: colors.textOnPrimary,
        },
      }),
    [colors, radius, spacing]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <Ionicons name={icon} size={18} color={colors.primary} />
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>

      {description ? <Text style={styles.description}>{description}</Text> : null}

      <View style={styles.timeBoxRow}>
        <Pressable
          style={styles.stepperBtn}
          onPress={() => onChange(adjustTime(value, -stepMinutes))}
          accessibilityRole="button"
          accessibilityLabel={'Decrease time by ' + stepMinutes + ' minutes'}
        >
          <Ionicons name="remove" size={18} color={colors.primaryText} />
        </Pressable>

        <Pressable style={styles.timeDisplayBtn} onPress={openPicker} accessibilityRole="button">
          <Text style={styles.timeText}>{formatted12h}</Text>
          <View style={styles.timeSubRow}>
            <Ionicons name="chevron-down-circle-outline" size={12} color={colors.primary} />
            <Text style={styles.timeSub}>Tap to select (AM/PM)</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.stepperBtn}
          onPress={() => onChange(adjustTime(value, stepMinutes))}
          accessibilityRole="button"
          accessibilityLabel={'Increase time by ' + stepMinutes + ' minutes'}
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
        </Pressable>
      </View>

      {presets.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.presetsScroll}
          contentContainerStyle={styles.presetsRow}
        >
          {presets.map((preset) => {
            const isSelected = value === preset.time;
            return (
              <Pressable
                key={preset.time}
                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                onPress={() => onChange(preset.time)}
                accessibilityRole="button"
              >
                <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Interactive Clickable Time Dropdown / Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {label}</Text>
              <Pressable style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Large Interactive Preview & AM/PM Toggle */}
            <View style={styles.previewCard}>
              <Text style={styles.previewDigits}>
                {selectedHour} : {selectedMinute}
              </Text>
              <View style={styles.ampmToggleRow}>
                <Pressable
                  style={[styles.ampmPill, selectedPeriod === 'AM' && styles.ampmPillActive]}
                  onPress={() => setSelectedPeriod('AM')}
                >
                  <Ionicons
                    name="sunny"
                    size={13}
                    color={selectedPeriod === 'AM' ? colors.textOnPrimary : colors.textSecondary}
                  />
                  <Text style={[styles.ampmText, selectedPeriod === 'AM' && styles.ampmTextActive]}>
                    AM
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.ampmPill, selectedPeriod === 'PM' && styles.ampmPillActive]}
                  onPress={() => setSelectedPeriod('PM')}
                >
                  <Ionicons
                    name="moon"
                    size={13}
                    color={selectedPeriod === 'PM' ? colors.textOnPrimary : colors.textSecondary}
                  />
                  <Text style={[styles.ampmText, selectedPeriod === 'PM' && styles.ampmTextActive]}>
                    PM
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Select Hour Dropdown / Grid */}
            <View style={styles.gridSection}>
              <Text style={styles.gridSectionTitle}>Select Hour</Text>
              <View style={styles.chipsGrid}>
                {HOURS.map((h) => {
                  const isSel = selectedHour === h;
                  return (
                    <Pressable
                      key={h}
                      style={[styles.timeChipItem, isSel && styles.timeChipItemActive]}
                      onPress={() => setSelectedHour(h)}
                    >
                      <Text style={[styles.timeChipItemText, isSel && styles.timeChipItemTextActive]}>
                        {h}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Select Minute Dropdown / Grid */}
            <View style={styles.gridSection}>
              <Text style={styles.gridSectionTitle}>Select Minute</Text>
              <View style={styles.chipsGrid}>
                {MINUTES.map((m) => {
                  const isSel = selectedMinute === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.timeChipItem, isSel && styles.timeChipItemActive]}
                      onPress={() => setSelectedMinute(m)}
                    >
                      <Text style={[styles.timeChipItemText, isSel && styles.timeChipItemTextActive]}>
                        :{m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActionsRow}>
              <Pressable style={styles.cancelModalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmModalBtn} onPress={handleConfirm}>
                <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                <Text style={styles.confirmModalBtnText}>Set Time ({selectedHour}:{selectedMinute} {selectedPeriod})</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
