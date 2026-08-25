import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { addHabit } from '../../services/habitsService';

const CATEGORIES = [
  { id: 'cat-1', label: 'Fitness', icon: 'barbell', color: '#EA580C', bg: '#FFEDD5' },
  { id: 'cat-2', label: 'Hydration', icon: 'water', color: '#0284C7', bg: '#E0F2FE' },
  { id: 'cat-3', label: 'Nutrition', icon: 'restaurant', color: '#059669', bg: '#D1FAE5' },
  { id: 'cat-4', label: 'Growth', icon: 'book', color: '#7C3AED', bg: '#EDE9FE' },
  { id: 'cat-5', label: 'Mindfulness', icon: 'flower', color: '#D946EF', bg: '#FDF4FF' },
  { id: 'cat-6', label: 'Recovery', icon: 'moon', color: '#4F46E5', bg: '#E0E7FF' },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const TIME_PRESETS = [
  { label: '07:00 AM', time: '07:00', icon: 'partly-sunny' as const },
  { label: '08:30 AM', time: '08:30', icon: 'sunny' as const },
  { label: '06:00 PM', time: '18:00', icon: 'cloudy-night' as const },
  { label: '09:30 PM', time: '21:30', icon: 'moon' as const },
];

// `category` must match a CATEGORIES label above — selecting a preset sets it, so the saved
// habit's icon agrees with its title instead of contradicting it.
const PRESETS = [
  { title: 'Morning Cardio & Gym', time: '07:00', category: 'Fitness', icon: 'barbell', color: '#EA580C', bg: '#FFEDD5' },
  { title: 'Drink 500ml Water', time: '08:00', category: 'Hydration', icon: 'water', color: '#0284C7', bg: '#E0F2FE' },
  { title: 'Sri Lankan Veggie Lunch', time: '12:30', category: 'Nutrition', icon: 'restaurant', color: '#059669', bg: '#D1FAE5' },
  { title: 'Sunset 5,000 Steps Walk', time: '18:00', category: 'Fitness', icon: 'footsteps', color: '#0D9488', bg: '#CCFBF1' },
  { title: 'Read Book & Study', time: '20:30', category: 'Growth', icon: 'book', color: '#7C3AED', bg: '#EDE9FE' },
  { title: 'Digital Detox & Sleep', time: '22:30', category: 'Recovery', icon: 'moon', color: '#4F46E5', bg: '#E0E7FF' },
];

function format12h(timeStr: string): string {
  const [hStr, mStr] = (timeStr || '07:30').split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const padH = h < 10 ? `0${h}` : `${h}`;
  const padM = m < 10 ? `0${m}` : `${m}`;
  return `${padH}:${padM} ${ampm}`;
}

function adjustMinutes(timeStr: string, deltaMin: number): string {
  const [hStr, mStr] = (timeStr || '07:30').split(':');
  let h = parseInt(hStr, 10) || 0;
  let m = parseInt(mStr, 10) || 0;
  let totalMin = h * 60 + m + deltaMin;
  if (totalMin < 0) totalMin += 24 * 60;
  totalMin = totalMin % (24 * 60);
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  const padH = newH < 10 ? `0${newH}` : `${newH}`;
  const padM = newM < 10 ? `0${newM}` : `${newM}`;
  return `${padH}:${padM}`;
}

export default function AddEditHabitScreen({ navigation }: any) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [preferredTime, setPreferredTime] = useState('07:30');
  const [selectedCategory, setSelectedCategory] = useState('Fitness');
  // Defaults to just today — a habit only repeats on other days if the user explicitly picks them.
  const [selectedDays, setSelectedDays] = useState<number[]>([new Date().getDay()]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  // Time Picker Modal State
  const [showPicker, setShowPicker] = useState(false);
  const [modalHour, setModalHour] = useState(7);
  const [modalMinute, setModalMinute] = useState(30);
  const [modalAmPm, setModalAmPm] = useState<'AM' | 'PM'>('AM');

  const openPicker = () => {
    const [hStr, mStr] = preferredTime.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    setModalHour(h);
    setModalMinute(m);
    setModalAmPm(ampm);
    setShowPicker(true);
  };

  const confirmPicker = () => {
    let h24 = modalHour % 12;
    if (modalAmPm === 'PM') h24 += 12;
    const padH = h24 < 10 ? `0${h24}` : `${h24}`;
    const padM = modalMinute < 10 ? `0${modalMinute}` : `${modalMinute}`;
    setPreferredTime(`${padH}:${padM}`);
    setShowPicker(false);
  };

  const handleSave = async () => {
    if (!user || !title.trim() || saving || created || selectedDays.length === 0) return;
    setSaving(true);
    const habitName = title.trim();

    // Awaited, and `created` is only set once the write actually succeeds. Previously the green
    // "Habit Created!" state was set *before* the write, with the failure swallowed by a
    // console.warn — so an offline or rejected save still showed success and navigated away,
    // leaving the user with a habit that does not exist.
    try {
      await addHabit(user.uid, {
        title: habitName,
        category: selectedCategory,
        recurring: selectedDays.length === 7,
        daysOfWeek: selectedDays,
        preferredTime,
      });
      setCreated(true);
      navigation.navigate('HabitsList');
    } catch (error: any) {
      Alert.alert(
        'Could not create habit',
        error?.code === 'permission-denied'
          ? 'The database rejected the write. Check that your Firestore rules are deployed.'
          : error?.message ?? 'Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const selectPreset = (p: (typeof PRESETS)[0]) => {
    setTitle(p.title);
    setPreferredTime(p.time);
    // Without this, picking "Drink 500ml Water" left the category on whatever was selected
    // before, so the saved habit carried a category that contradicted its own title.
    setSelectedCategory(p.category);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: isDark ? '#0B0D17' : '#FFFFFF',
        },
        container: {
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 140,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        },
        circleBtn: {
          width: 42,
          height: 42,
          borderRadius: 21,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        },
        titleText: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        sectionTitle: {
          fontSize: 15,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          marginBottom: 10,
          marginTop: 14,
        },
        sectionTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          marginTop: 14,
        },
        inputBox: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          fontSize: 15,
          color: isDark ? '#F8FAFC' : '#0F172A',
          fontWeight: '600',
        },
        categoriesGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        catPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 16,
          borderWidth: 1,
        },
        catPillText: {
          fontSize: 12,
          fontWeight: '700',
        },

        // Repeat Days Picker
        dayPickerRow: {
          flexDirection: 'row',
          gap: 8,
          justifyContent: 'space-between',
        },
        dayPickerPill: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        dayPickerPillActive: {
          backgroundColor: '#4F46E5',
          borderColor: '#4F46E5',
        },
        dayPickerText: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        dayPickerTextActive: {
          color: '#FFFFFF',
        },
        dayPickerWarning: {
          fontSize: 11,
          color: '#EF4444',
          fontWeight: '700',
          marginTop: 6,
        },

        // Modern Stepper Time Control
        stepperWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 18,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        stepperBtn: {
          width: 42,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        stepperCenter: {
          alignItems: 'center',
          flex: 1,
        },
        stepperTimeText: {
          fontSize: 19,
          fontWeight: '900',
          color: '#4F46E5',
        },
        tapHint: {
          fontSize: 10,
          fontWeight: '700',
          color: '#6366F1',
          textTransform: 'uppercase',
          marginTop: 1,
        },
        timePresetsRow: {
          flexDirection: 'row',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: 8,
        },
        timePresetPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 12,
          backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        timePresetPillActive: {
          backgroundColor: '#4F46E5',
          borderColor: '#4F46E5',
        },
        timePresetPillText: {
          fontSize: 11,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        timePresetPillTextActive: {
          color: '#FFFFFF',
        },

        presetsGrid: {
          gap: 8,
        },
        presetRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 18,
          padding: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        presetLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        presetIconBox: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
        },
        presetTitle: {
          fontSize: 13,
          fontWeight: '700',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        presetTime: {
          fontSize: 12,
          fontWeight: '700',
          color: '#64748B',
        },
        createBtn: {
          backgroundColor: isDark ? '#38BDF8' : '#0F172A',
          borderRadius: 20,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 24,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        },
        createBtnSuccess: {
          backgroundColor: '#10B981',
        },
        createBtnText: {
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: '800',
        },

        // Modal Picker Styles
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          justifyContent: 'flex-end',
        },
        modalSheet: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 22,
          paddingTop: 20,
          paddingBottom: insets.bottom + 20,
          gap: 16,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          textAlign: 'center',
        },
        modalPickerRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        },
        modalColumn: {
          alignItems: 'center',
          gap: 8,
        },
        modalColLabel: {
          fontSize: 11,
          fontWeight: '700',
          color: '#64748B',
          textTransform: 'uppercase',
        },
        modalPillBox: {
          flexDirection: 'row',
          gap: 4,
          flexWrap: 'wrap',
          maxWidth: 160,
          justifyContent: 'center',
        },
        modalPillItem: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 10,
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
        },
        modalPillItemActive: {
          backgroundColor: '#4F46E5',
        },
        modalConfirmBtn: {
          backgroundColor: '#4F46E5',
          borderRadius: 16,
          paddingVertical: 14,
          alignItems: 'center',
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Single Clean Top Header */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.titleText}>Create Habit</Text>
          <View style={{ width: 42 }} />
        </View>

        {/* Habit Name Input */}
        <Text style={styles.sectionTitle}>Habit Name</Text>
        <TextInput
          style={styles.inputBox}
          placeholder="e.g. Morning Workout, Green Tea, Read"
          placeholderTextColor="#94A3B8"
          value={title}
          onChangeText={setTitle}
        />

        {/* Category Pills */}
        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map((c) => {
            const isSelected = selectedCategory === c.label;
            return (
              <Pressable
                key={c.id}
                style={[
                  styles.catPill,
                  {
                    backgroundColor: isSelected ? c.color : (isDark ? '#1E293B' : c.bg),
                    borderColor: isSelected ? c.color : (isDark ? '#334155' : c.bg),
                  },
                ]}
                onPress={() => setSelectedCategory(c.label)}
              >
                <Ionicons name={c.icon as any} size={14} color={isSelected ? '#FFFFFF' : c.color} />
                <Text
                  style={[
                    styles.catPillText,
                    { color: isSelected ? '#FFFFFF' : (isDark ? '#F8FAFC' : c.color) },
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Repeat Days Picker */}
        <Text style={styles.sectionTitle}>Repeat On</Text>
        <View style={styles.dayPickerRow}>
          {DAY_LABELS.map((label, day) => {
            const isSelected = selectedDays.includes(day);
            return (
              <Pressable
                key={day}
                style={[styles.dayPickerPill, isSelected && styles.dayPickerPillActive]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayPickerText, isSelected && styles.dayPickerTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {selectedDays.length === 0 ? (
          <Text style={styles.dayPickerWarning}>Select at least one day.</Text>
        ) : null}

        {/* Target Time Slot - Clean Stepper UI */}
        <Text style={styles.sectionTitle}>Target Time Slot</Text>
        <View style={styles.stepperWrapper}>
          <Pressable style={styles.stepperBtn} onPress={() => setPreferredTime(adjustMinutes(preferredTime, -15))}>
            <Ionicons name="remove" size={18} color="#4F46E5" />
          </Pressable>
          <Pressable style={styles.stepperCenter} onPress={openPicker}>
            <Text style={styles.stepperTimeText}>{format12h(preferredTime)}</Text>
            <Text style={styles.tapHint}>TAP TO SELECT (AM/PM)</Text>
          </Pressable>
          <Pressable style={styles.stepperBtn} onPress={() => setPreferredTime(adjustMinutes(preferredTime, 15))}>
            <Ionicons name="add" size={18} color="#4F46E5" />
          </Pressable>
        </View>

        {/* Time Presets */}
        <View style={styles.timePresetsRow}>
          {TIME_PRESETS.map((p, idx) => {
            const isActive = preferredTime === p.time;
            return (
              <Pressable
                key={idx}
                style={[styles.timePresetPill, isActive && styles.timePresetPillActive]}
                onPress={() => setPreferredTime(p.time)}
              >
                <Ionicons
                  name={p.icon}
                  size={12}
                  color={isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                />
                <Text style={[styles.timePresetPillText, isActive && styles.timePresetPillTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Quick Habit Presets */}
        <View style={styles.sectionTitleRow}>
          <Ionicons name="flash" size={16} color={isDark ? '#F8FAFC' : '#0F172A'} />
          <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Quick Habit Presets</Text>
        </View>
        <View style={styles.presetsGrid}>
          {PRESETS.map((p, idx) => (
            <Pressable key={idx} style={styles.presetRow} onPress={() => selectPreset(p)}>
              <View style={styles.presetLeft}>
                <View style={[styles.presetIconBox, { backgroundColor: p.bg }]}>
                  <Ionicons name={p.icon as any} size={16} color={p.color} />
                </View>
                <Text style={styles.presetTitle}>{p.title}</Text>
              </View>
              <Text style={styles.presetTime}>{p.time}</Text>
            </Pressable>
          ))}
        </View>

        {/* Create Habit Action Button */}
        <Pressable
          style={[styles.createBtn, created && styles.createBtnSuccess]}
          onPress={handleSave}
          disabled={!title.trim() || saving || created || selectedDays.length === 0}
        >
          {!saving ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
          <Text style={styles.createBtnText}>
            {created ? 'Habit Created!' : saving ? 'Saving Habit...' : 'Create Habit'}
          </Text>
        </Pressable>
      </ScrollView>

      {/* AM/PM Time Selector Modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select Preferred Time</Text>

            <View style={styles.modalPickerRow}>
              {/* Hour */}
              <View style={styles.modalColumn}>
                <Text style={styles.modalColLabel}>Hour</Text>
                <View style={styles.modalPillBox}>
                  {[5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4].map((h) => (
                    <Pressable
                      key={h}
                      style={[styles.modalPillItem, modalHour === h && styles.modalPillItemActive]}
                      onPress={() => setModalHour(h)}
                    >
                      <Text style={{ color: modalHour === h ? '#FFFFFF' : '#0F172A', fontWeight: '800', fontSize: 13 }}>
                        {h}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Minute */}
              <View style={styles.modalColumn}>
                <Text style={styles.modalColLabel}>Minute</Text>
                <View style={{ gap: 6 }}>
                  {[0, 15, 30, 45].map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.modalPillItem, modalMinute === m && styles.modalPillItemActive]}
                      onPress={() => setModalMinute(m)}
                    >
                      <Text style={{ color: modalMinute === m ? '#FFFFFF' : '#0F172A', fontWeight: '800', fontSize: 13 }}>
                        {m < 10 ? `0${m}` : m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* AM/PM */}
              <View style={styles.modalColumn}>
                <Text style={styles.modalColLabel}>Period</Text>
                <View style={{ gap: 6 }}>
                  {(['AM', 'PM'] as const).map((period) => (
                    <Pressable
                      key={period}
                      style={[styles.modalPillItem, modalAmPm === period && styles.modalPillItemActive]}
                      onPress={() => setModalAmPm(period)}
                    >
                      <Text style={{ color: modalAmPm === period ? '#FFFFFF' : '#0F172A', fontWeight: '800', fontSize: 13 }}>
                        {period}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable style={styles.modalConfirmBtn} onPress={confirmPicker}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
