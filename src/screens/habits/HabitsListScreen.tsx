import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToHabits, updateHabit } from '../../services/habitsService';
import { logHabitCompletion, subscribeToHabitLogs } from '../../services/logsService';
import { subscribeToUserProfile } from '../../services/profileService';
import { recommendForHabits, MIN_ATTEMPTS_FOR_CONFIDENCE, type LocalRecommendation } from '../../ml/recommender';
import type { Habit, HabitLog, UserProfile } from '../../types';
import { toDateKey } from '../../utils/dates';

interface ActivityItem {
  id: string;
  timeSlot: string; // e.g. "6:30"
  period: string; // e.g. "AM"
  timeMinutes: number; // e.g. 390
  title: string;
  subtitle: string;
  preferredTime: string; // "HH:mm" — the user's own choice, not the recommendation
  suggestedTime: string | null; // the engine's suggestion, offered rather than auto-applied
  recReason: string | null; // the engine's own explanation, the one genuinely honest field
  icon: keyof typeof Ionicons.glyphMap;
  bgColor: string;
  iconBg: string;
  iconColor: string;
  checkColor: string;
}

// Visual style per activity card — cycled deterministically by habit id, since Habit itself
// carries no color/icon data (that would be presentation state, not domain data).
const PALETTE: Array<Pick<ActivityItem, 'icon' | 'bgColor' | 'iconBg' | 'iconColor' | 'checkColor'>> = [
  { icon: 'leaf-outline', bgColor: '#ECFDF5', iconBg: '#A7F3D0', iconColor: '#047857', checkColor: '#10B981' },
  { icon: 'cafe-outline', bgColor: '#EFF6FF', iconBg: '#BFDBFE', iconColor: '#1D4ED8', checkColor: '#2563EB' },
  { icon: 'nutrition-outline', bgColor: '#FFF7ED', iconBg: '#FED7AA', iconColor: '#C2410C', checkColor: '#F97316' },
  { icon: 'fitness-outline', bgColor: '#F5F3FF', iconBg: '#DDD6FE', iconColor: '#6D28D9', checkColor: '#7C3AED' },
];

// Keyed by the category the user picked in AddEditHabitScreen. Labels must stay in sync with
// CATEGORIES there.
const CATEGORY_PALETTE: Record<string, (typeof PALETTE)[number]> = {
  Fitness: { icon: 'barbell-outline', bgColor: '#FFF7ED', iconBg: '#FED7AA', iconColor: '#C2410C', checkColor: '#EA580C' },
  Hydration: { icon: 'water-outline', bgColor: '#EFF6FF', iconBg: '#BFDBFE', iconColor: '#1D4ED8', checkColor: '#0284C7' },
  Nutrition: { icon: 'restaurant-outline', bgColor: '#ECFDF5', iconBg: '#A7F3D0', iconColor: '#047857', checkColor: '#059669' },
  Growth: { icon: 'book-outline', bgColor: '#F5F3FF', iconBg: '#DDD6FE', iconColor: '#6D28D9', checkColor: '#7C3AED' },
  Mindfulness: { icon: 'flower-outline', bgColor: '#FDF4FF', iconBg: '#F5D0FE', iconColor: '#A21CAF', checkColor: '#D946EF' },
  Recovery: { icon: 'moon-outline', bgColor: '#EEF2FF', iconBg: '#C7D2FE', iconColor: '#4338CA', checkColor: '#4F46E5' },
};

/**
 * Habits created before `category` was persisted have none, so they fall back to a deterministic
 * hash of the document id — arbitrary, but stable per habit. New habits use the category the
 * user actually chose, which is why the icon now matches the title.
 */
function paletteForHabit(habit: Habit) {
  if (habit.category && CATEGORY_PALETTE[habit.category]) {
    return CATEGORY_PALETTE[habit.category];
  }
  let hash = 0;
  for (let i = 0; i < habit.id.length; i++) hash = (hash * 31 + habit.id.charCodeAt(i)) % PALETTE.length;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Below this many logged attempts the model's output is dominated by the prior rather than by
 *  this user's data, so no percentage is shown at all. Shared with the Dashboard. */
const MIN_ATTEMPTS_FOR_RATE = MIN_ATTEMPTS_FOR_CONFIDENCE;

/** Builds the day's activity list from the user's real habits, with the on-device model's
 *  suggestion carried alongside (but never overwriting) the time the user chose. */
function buildActivitiesForDate(
  habits: Habit[],
  recommendations: LocalRecommendation[],
  dateKey: string,
  attemptsByHabit: Map<string, number>
): ActivityItem[] {
  const dayOfWeek = new Date(`${dateKey}T00:00:00`).getDay();
  const recByHabit = new Map(recommendations.map((r) => [r.habitId, r]));

  const items = habits
    .filter((h) => h.daysOfWeek.length === 0 || h.daysOfWeek.includes(dayOfWeek))
    .map((h) => {
      const rec = recByHabit.get(h.id);

      // The card shows the time the USER chose. Letting the recommendation win here meant editing
      // a habit's time appeared to do nothing — the edit saved, then the rec overwrote the
      // display. The suggestion is offered explicitly in the edit sheet instead.
      const timeStr = h.preferredTime || '07:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      const timeMinutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
      const { timeSlot, period } = parseMinutesToTime(timeMinutes);

      // Only claim a rate once real attempts back it. The previous server engine returned 0.5 as
      // a literal "not enough history yet" sentinel, which the UI rendered as "50% likely" —
      // presenting an absence of data as a confident prediction.
      const attempts = attemptsByHabit.get(h.id) ?? 0;
      const recScore = rec?.confidence ?? null;
      const schedule =
        h.daysOfWeek.length === 7
          ? 'Every day'
          : h.daysOfWeek.length > 0
          ? h.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')
          : 'Unscheduled';
      const subtitle =
        recScore !== null && attempts >= MIN_ATTEMPTS_FOR_RATE
          ? `${schedule} · ${Math.round(recScore * 100)}% success rate`
          : schedule;

      return {
        id: h.id,
        timeSlot,
        period,
        timeMinutes,
        title: h.title,
        subtitle,
        preferredTime: timeStr,
        // Carried so the edit sheet can offer the suggestion explicitly, with the engine's own
        // wording, rather than silently applying it to the card.
        suggestedTime: rec?.suggestedTime ?? null,
        recReason: rec?.reason ?? null,
        ...paletteForHabit(h),
      };
    });

  items.sort((a, b) => a.timeMinutes - b.timeMinutes);
  return items;
}

function generateWeeklyDates(): { dayLabel: string; dateNum: string; dateKey: string }[] {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const dates = [];

  for (let i = -3; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayLabel = labels[d.getDay()];
    const dateNum = d.getDate() < 10 ? `0${d.getDate()}` : `${d.getDate()}`;
    const dateKey = toDateKey(d);
    dates.push({ dayLabel, dateNum, dateKey });
  }
  return dates;
}

function parseMinutesToTime(min: number): { timeFormatted: string; timeSlot: string; period: string } {
  const normalized = ((min % 1440) + 1440) % 1440;
  let h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const padM = m < 10 ? `0${m}` : `${m}`;
  const timeSlot = `${h}:${padM}`;
  return {
    timeFormatted: `${timeSlot} ${period}`,
    timeSlot,
    period,
  };
}

export default function HabitsListScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const weeklyDates = useMemo(() => generateWeeklyDates(), []);
  const [selectedDateKey, setSelectedDateKey] = useState(weeklyDates[3].dateKey); // default today

  // `null` until the first snapshot lands. Initialising to [] made "still loading" and "you have
  // no habits" the same value, so a new user was told they had nothing scheduled before Firestore
  // had answered.
  const [userHabits, setUserHabits] = useState<Habit[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToHabits(user.uid, setUserHabits);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserProfile(user.uid, setProfile);
  }, [user]);

  // Real completion history from Firestore — so past-day completion state (not just today's
  // session) reflects what was actually logged, e.g. via seeded data or earlier app sessions.
  const [habitLogs, setHabitLogs] = useState<HabitLog[] | null>(null);
  useEffect(() => {
    if (!user) return;
    return subscribeToHabitLogs(user.uid, setHabitLogs);
  }, [user]);

  // How many days this habit has actually been attempted — gates whether a success rate is
  // shown at all, so a placeholder score is never dressed up as a statistic.
  const attemptsByHabit = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of habitLogs ?? []) m.set(l.habitId, (m.get(l.habitId) ?? 0) + 1);
    return m;
  }, [habitLogs]);

  // Live-derived from the user's real habits for the selected date — updates automatically
  // whenever a habit is added/edited, no local copy to keep in sync.
  // Same on-device model the Dashboard uses, so the two screens can never disagree about what
  // was suggested. The Firestore `recommendations` collection it read before is only ever
  // populated by a Cloud Function that this project does not deploy.
  const recommendations = useMemo(
    () => (habitLogs === null ? [] : recommendForHabits(userHabits ?? [], habitLogs, profile)),
    [userHabits, habitLogs, profile]
  );

  const activities = useMemo(
    () => buildActivitiesForDate(userHabits ?? [], recommendations, selectedDateKey, attemptsByHabit),
    [userHabits, recommendations, selectedDateKey, attemptsByHabit]
  );

  const isLoading = !user || userHabits === null || habitLogs === null;

  // Keyed by `${date}_${habitId}`. Writes are now upserts on a deterministic document id
  // (see logsService.logHabitCompletion), but accounts created before that change can still
  // hold several auto-ID documents for the same habit-day. The canonical document wins; legacy
  // duplicates only fill in where no canonical one exists, so the tick is deterministic either
  // way rather than depending on snapshot ordering.
  const completedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const log of habitLogs ?? []) {
      const key = `${log.date}_${log.habitId}`;
      const isCanonical = log.id === `${log.habitId}_${log.date}`;
      if (isCanonical || !(key in map)) {
        map[key] = log.success;
      }
    }
    return map;
  }, [habitLogs]);

  // Edit Activity Modal State (title + time together)
  const [editingItem, setEditingItem] = useState<ActivityItem | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingMinutes, setEditingMinutes] = useState(390);
  const [savingEdit, setSavingEdit] = useState(false);

  // Toggle completion ONLY for the currently selected date — writes a new log; the live
  // subscription above picks it up and completedMap re-derives automatically.
  const toggleActivityCompletion = (id: string) => {
    if (!user) return;
    const key = `${selectedDateKey}_${id}`;
    const newState = !completedMap[key];
    logHabitCompletion(user.uid, {
      habitId: id,
      date: selectedDateKey,
      completedAt: newState ? new Date().toTimeString().slice(0, 5) : null,
      success: newState,
    }).catch(() => {});
  };

  // Open Edit Modal — tapping the card itself (name + time together), same sheet the time
  // column used to open alone.
  const openEditModal = (item: ActivityItem) => {
    setEditingItem(item);
    setEditingTitle(item.title);
    setEditingMinutes(item.timeMinutes);
  };

  const saveActivityEdits = async () => {
    if (!editingItem || !user) return;
    const { hh, mm } = (() => {
      const normalized = ((editingMinutes % 1440) + 1440) % 1440;
      return { hh: Math.floor(normalized / 60), mm: normalized % 60 };
    })();
    const preferredTime = `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
    const cleanTitle = editingTitle.trim() || editingItem.title;

    setSavingEdit(true);
    try {
      await updateHabit(user.uid, editingItem.id, { title: cleanTitle, preferredTime });
      setEditingItem(null);
    } catch (err: any) {
      // Keep the modal open on failure so the user's edits aren't lost.
      Alert.alert('Update Failed', err?.message || 'Could not save activity changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: isDark ? '#0B0D17' : '#F8FAFC',
        },
        container: {
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 100,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        },
        circleBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        },
        screenTitle: {
          fontSize: 20,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.4,
        },

        // Weekly Dates Strip
        weekStripContainer: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 20,
          paddingVertical: 4,
        },
        datePillCol: {
          alignItems: 'center',
          gap: 6,
        },
        dayNameText: {
          fontSize: 12,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        dateCircle: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        dateCircleActive: {
          backgroundColor: '#0F172A',
          borderColor: '#0F172A',
        },
        dateNumText: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        dateNumTextActive: {
          color: '#FFFFFF',
        },

        // Clean Timeline Layout
        timelineContainer: {
          marginTop: 6,
          gap: 12,
        },
        timelineRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        timeCol: {
          width: 46,
          alignItems: 'center',
          justifyContent: 'center',
        },
        timeSlotText: {
          fontSize: 12,
          fontWeight: '900',
          color: isDark ? '#38BDF8' : '#0F172A',
          textAlign: 'center',
        },
        periodText: {
          fontSize: 10,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
          textAlign: 'center',
        },
        timelineDotLine: {
          width: 2,
          height: 14,
          backgroundColor: isDark ? '#334155' : '#E2E8F0',
          marginVertical: 2,
        },

        // Full-Width Card with Proper Spacing
        cardWrapper: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          shadowColor: '#000000',
          shadowOpacity: 0.03,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 1,
        },
        cardLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          flex: 1,
          paddingRight: 10,
        },
        iconBox: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cardTextContainer: {
          flex: 1,
          justifyContent: 'center',
        },
        cardTitle: {
          fontSize: 13,
          fontWeight: '800',
          color: '#0F172A',
          letterSpacing: -0.2,
        },
        cardCals: {
          fontSize: 11,
          fontWeight: '600',
          color: '#64748B',
          marginTop: 2,
        },
        checkBtn: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: '#CBD5E1',
          backgroundColor: '#FFFFFF',
        },
        checkBtnActive: {
          borderColor: '#10B981',
          backgroundColor: '#10B981',
        },

        // Modal Time Adjust Styles
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        },
        modalSheet: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 22,
          paddingTop: 20,
          paddingBottom: insets.bottom + 20,
          gap: 14,
        },
        modalTitle: {
          fontSize: 17,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          textAlign: 'center',
        },
        stepperWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        stepperBtn: {
          width: 44,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        },
        stepperValue: {
          fontSize: 20,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        saveTimeBtn: {
          backgroundColor: '#0F172A',
          borderRadius: 16,
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        saveTimeBtnText: {
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: '800',
        },
        nameInputWrapper: {
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        nameInput: {
          fontSize: 14,
          fontWeight: '700',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },

        // Empty State
        emptyState: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 40,
          gap: 8,
        },
        emptyStateText: {
          fontSize: 13,
          fontWeight: '700',
          color: '#94A3B8',
        },
        emptyStateLink: {
          fontSize: 13,
          fontWeight: '800',
          color: '#2563EB',
          marginTop: 4,
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.screenTitle}>Activity</Text>
          <Pressable style={styles.circleBtn} onPress={() => navigation.navigate('AddEditHabit')}>
            <Ionicons name="add" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
        </View>

        {/* Date Selector Horizontal Strip */}
        <View style={styles.weekStripContainer}>
          {weeklyDates.map((item) => {
            const isSelected = item.dateKey === selectedDateKey;
            return (
              <Pressable
                key={item.dateKey}
                style={styles.datePillCol}
                onPress={() => setSelectedDateKey(item.dateKey)}
              >
                <Text style={styles.dayNameText}>{item.dayLabel}</Text>
                <View style={[styles.dateCircle, isSelected && styles.dateCircleActive]}>
                  <Text style={[styles.dateNumText, isSelected && styles.dateNumTextActive]}>
                    {item.dateNum}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Timeline Activities List — generated from the user's real habits for this date */}
        <View style={styles.timelineContainer}>
          {isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={28} color="#94A3B8" />
              <Text style={styles.emptyStateText}>
                {userHabits!.length === 0
                  ? "You haven't added any habits yet."
                  : `Nothing scheduled for ${new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}.`}
              </Text>
              <Pressable onPress={() => navigation.navigate('AddEditHabit')}>
                <Text style={styles.emptyStateLink}>+ Add a habit</Text>
              </Pressable>
            </View>
          ) : (
            activities.map((item) => {
              const isDone = !!completedMap[`${selectedDateKey}_${item.id}`];

              return (
                <View key={item.id} style={styles.timelineRow}>
                  {/* Clean Time Column */}
                  <Pressable style={styles.timeCol} onPress={() => openEditModal(item)}>
                    {item.timeSlot ? (
                      <>
                        <Text style={styles.timeSlotText}>{item.timeSlot}</Text>
                        <Text style={styles.periodText}>{item.period}</Text>
                      </>
                    ) : (
                      <View style={styles.timelineDotLine} />
                    )}
                  </Pressable>

                  {/* Activity Card — tap to edit name/time together */}
                  <Pressable
                    style={[styles.cardWrapper, { backgroundColor: item.bgColor }]}
                    onPress={() => openEditModal(item)}
                  >
                    <View style={styles.cardLeft}>
                      <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                        <Ionicons name={item.icon} size={18} color={item.iconColor} />
                      </View>
                      <View style={styles.cardTextContainer}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.cardCals}>{item.subtitle}</Text>
                      </View>
                    </View>

                    {/* Date-Isolated Interactive Checkmark */}
                    <Pressable
                      style={[styles.checkBtn, isDone && styles.checkBtnActive]}
                      onPress={() => toggleActivityCompletion(item.id)}
                      hitSlop={6}
                    >
                      {isDone ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                    </Pressable>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Edit Activity Modal — name + time together */}
      <Modal
        visible={editingItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingItem(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditingItem(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Activity</Text>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Activity Name
              </Text>
              <View style={styles.nameInputWrapper}>
                <TextInput
                  style={styles.nameInput}
                  value={editingTitle}
                  onChangeText={setEditingTitle}
                  placeholder="e.g. Morning Walk"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.stepperWrapper}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setEditingMinutes((m) => Math.max(0, m - 15))}
              >
                <Ionicons name="remove" size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
              </Pressable>
              <Text style={styles.stepperValue}>{parseMinutesToTime(editingMinutes).timeFormatted}</Text>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setEditingMinutes((m) => Math.min(1439, m + 15))}
              >
                <Ionicons name="add" size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
              </Pressable>
            </View>

            {/*
              The recommendation is offered here rather than silently overwriting the card's time.
              `reason` is the engine's own wording — the one field it produces that is honest
              regardless of how much history exists — and it was previously rendered nowhere.
            */}
            {editingItem?.suggestedTime && editingItem.suggestedTime !== editingItem.preferredTime ? (
              <View style={{ gap: 6 }}>
                {editingItem.recReason ? (
                  <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 16 }}>
                    {editingItem.recReason}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => {
                    const [h, m] = editingItem.suggestedTime!.split(':').map(Number);
                    setEditingMinutes((Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0));
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyStateLink}>
                    Use suggested time ({editingItem.suggestedTime})
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable style={styles.saveTimeBtn} onPress={saveActivityEdits} disabled={savingEdit}>
              <Text style={styles.saveTimeBtnText}>{savingEdit ? 'Saving…' : 'Done'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
