import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToHabits } from '../../services/habitsService';
import { getCurrentWeather, weatherTip } from '../../services/weatherService';
import { subscribeToTodayFoodLogs } from '../../services/foodService';
import {
  incrementWaterMl,
  subscribeToTodayHealthLog,
  fetchRecentHabitLogs,
  subscribeToHabitLogs,
} from '../../services/logsService';
import { subscribeToUserProfile } from '../../services/profileService';
import { useTodayStepsState } from '../../hooks/useTodaySteps';
import { useHeartRate } from '../../hooks/useHeartRate';
import { DEFAULT_DAILY_GOALS, deriveMacroTargets, positiveGoalOr } from '../../constants/goals';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import { toDateKey } from '../../utils/dates';
import { estimateActiveBurnKcal, estimateDistanceKm } from '../../utils/activity';
import { buildDashboardAlerts } from '../../utils/dashboardAlerts';
import { recommendForHabits, MIN_ATTEMPTS_FOR_CONFIDENCE } from '../../ml/recommender';
import { syncHabitReminders, disableHabitReminders } from '../../services/notificationsService';
import CircularProgressRing from '../../components/CircularProgressRing';
import type {
  DailyGoals,
  FoodLog,
  HealthLog,
  Habit,
  HabitLog,
  UserProfile,
} from '../../types';

function getTimeGreeting(): { greeting: string; icon: keyof typeof Ionicons.glyphMap } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good morning', icon: 'sunny' };
  if (hour < 17) return { greeting: 'Good afternoon', icon: 'partly-sunny' };
  return { greeting: 'Good evening', icon: 'moon' };
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const today = toDateKey();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[] | null>(null);
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null);
  const [todayFoodLogs, setTodayFoodLogs] = useState<FoodLog[]>([]);
  const [todayHealthLog, setTodayHealthLog] = useState<HealthLog | null>(null);
  const [goals, setGoals] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());

  // Firestore subscriptions deliver `[]`/`null` both before the first snapshot arrives and when
  // the user genuinely has nothing logged. These flags separate the two so a real zero renders as
  // "0" while a still-loading value renders as "—".
  const [foodLoaded, setFoodLoaded] = useState(false);
  const [healthLoaded, setHealthLoaded] = useState(false);

  const stepsState = useTodayStepsState(user?.uid);
  const steps = stepsState.status === 'ready' ? stepsState.steps : null;
  const heartScale = useRef(new Animated.Value(1)).current;
  const bpm = useHeartRate();

  // Targets are guarded rather than defaulted with `||`: the Settings editor does not validate its
  // input, so a negative target can already exist in a user document, and passing one through
  // would render a negative-width progress arc.
  const targetCalories = positiveGoalOr(goals.calorieTarget, DEFAULT_DAILY_GOALS.calorieTarget);
  const targetWater = positiveGoalOr(goals.waterTargetMl, DEFAULT_DAILY_GOALS.waterTargetMl);
  const targetSteps = positiveGoalOr(goals.stepTarget, DEFAULT_DAILY_GOALS.stepTarget);

  // `?? 0` throughout, never `|| n`: zero is the truthful answer for a day with nothing logged,
  // and `||` would silently replace it with a placeholder.
  const todayCalories = todayFoodLogs.reduce((sum, log) => sum + (log.totalCalories ?? 0), 0);
  const caloriesLeft = Math.max(0, targetCalories - todayCalories);
  const calorieProgress = Math.min(1, Math.max(0, todayCalories / targetCalories));

  const totalCarbs = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.carbsGrams ?? 0), 0);
  const totalProtein = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.proteinGrams ?? 0), 0);
  const totalFat = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.fatGrams ?? 0), 0);

  // Derived from the user's own calorie target so the two can never disagree — the previous
  // hardcoded 412/132/180 summed to 3,796 kcal against a stated 2,665 target.
  const macroTargets = useMemo(() => deriveMacroTargets(targetCalories), [targetCalories]);

  const todayWater = healthLoaded ? todayHealthLog?.waterMl ?? 0 : null;

  const stepGoalPct =
    steps === null ? null : Math.min(100, Math.round((steps / targetSteps) * 100));
  const activeBurnKcal = steps === null ? null : estimateActiveBurnKcal(steps, profile?.weightKg);
  const distanceKm = steps === null ? null : estimateDistanceKm(steps, profile?.heightCm);

  const habitsDoneToday = completedTodayIds.size;

  /**
   * Recommendations are computed on-device from the trained model (src/ml/), not read from
   * Firestore. The Cloud Function that used to produce them requires a Blaze plan and a deploy
   * step, so in practice the collection was always empty and this section had nothing to show.
   * Running the model locally means suggestions appear as soon as there are habits, work with no
   * network, and update the moment a completion is logged.
   */
  const liveRecommendations = useMemo(
    () => (habitLogs === null ? [] : recommendForHabits(habits, habitLogs, profile)),
    [habits, habitLogs, profile]
  );
  const recsLoaded = habitLogs !== null;

  // Derived from the day's real logged state — see utils/dashboardAlerts.ts.
  const alerts = useMemo(
    () =>
      buildDashboardAlerts({
        steps,
        stepTarget: targetSteps,
        waterMl: todayWater,
        waterTargetMl: targetWater,
        caloriesLogged: todayCalories,
        calorieTarget: targetCalories,
        foodLogCount: todayFoodLogs.length,
        habitsTotal: habits.length,
        habitsDone: habitsDoneToday,
        hour: new Date().getHours(),
      }),
    [
      steps,
      targetSteps,
      todayWater,
      targetWater,
      todayCalories,
      targetCalories,
      todayFoodLogs.length,
      habits.length,
      habitsDoneToday,
    ]
  );
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  /**
   * Keeps the OS-scheduled reminders in step with the model's current suggestions. This is the
   * "adaptive" half of adaptive notifications: as logged completions shift what the model
   * recommends, the reminder times move with them.
   *
   * Before this the whole notifications service had no call sites at all, so no reminder was ever
   * scheduled despite the feature being documented as working.
   */
  useEffect(() => {
    if (!user || habitLogs === null || habits.length === 0) return;
    // undefined means the setting predates the toggle, and the original behaviour was on.
    if (profile?.notificationsEnabled === false) {
      disableHabitReminders().catch(() => {});
      return;
    }
    syncHabitReminders(liveRecommendations, habits).catch((err) =>
      console.warn('[notifications] reminder sync failed:', err)
    );
  }, [user, habitLogs, habits, liveRecommendations, profile?.notificationsEnabled]);

  useEffect(() => {
    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(heartScale, {
          toValue: 1.25,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.0,
          duration: 180,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.15,
          duration: 160,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.0,
          duration: 350,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(450),
      ])
    );
    heartbeat.start();

    return () => {
      heartbeat.stop();
    };
  }, [heartScale]);

  useEffect(() => {
    // A signed-out render must not spin forever waiting for snapshots that will never arrive.
    if (!user) {
      setFoodLoaded(true);
      setHealthLoaded(true);
      setHabitLogs([]);
      return;
    }
    setFoodLoaded(false);
    setHealthLoaded(false);
    setHabitLogs(null);

    const unsubProfile = subscribeToUserProfile(user.uid, (p) => {
      console.log(
        '[profile] uid=', user.uid,
        '| snapshot=', p === null ? 'DOC MISSING' : 'ok',
        '| heightCm=', p?.heightCm,
        '| weightKg=', p?.weightKg
      );
      setProfile(p);
      if (p?.displayName) setDisplayName(p.displayName);
      if (p?.dailyGoals) setGoals(p.dailyGoals);
    });
    // Feeds the on-device recommender, so a new completion re-scores the habit immediately.
    const unsubLogs = subscribeToHabitLogs(user.uid, setHabitLogs);
    const unsubHabits = subscribeToHabits(user.uid, setHabits);
    const unsubFood = subscribeToTodayFoodLogs(user.uid, today, (logs) => {
      setTodayFoodLogs(logs);
      setFoodLoaded(true);
    });
    const unsubHealth = subscribeToTodayHealthLog(user.uid, today, (log) => {
      setTodayHealthLog(log);
      setHealthLoaded(true);
    });

    getCurrentWeather().then((w) => {
      if (w) setWeatherMessage(weatherTip(w));
    });

    fetchRecentHabitLogs(user.uid, today)
      .then((logs) => {
        const done = new Set(
          logs.filter((l) => l.success && l.date === today).map((l) => l.habitId)
        );
        setCompletedTodayIds(done);
      })
      .catch(() => setCompletedTodayIds(new Set()));

    return () => {
      unsubProfile();
      unsubLogs();
      unsubHabits();
      unsubFood();
      unsubHealth();
    };
  }, [user, today]);

  const handleQuickAddWater = async (amount: number) => {
    if (!user) return;
    console.log('[water] +', amount, 'ml -> users/' + user.uid + '/healthLogs/' + today);
    try {
      await incrementWaterMl(user.uid, today, amount);
      console.log('[water] write confirmed by server');
    } catch (err: any) {
      console.warn('[water] write FAILED:', err?.code, err?.message);
      // Without this the button silently does nothing when the write is rejected. Firestore
      // applies the increment to the local snapshot straight away, so an offline tap still
      // updates the number here and syncs when the connection returns — this alert is for a
      // genuine failure (rules, signed-out session), not for being offline.
      Alert.alert('Could not save', 'Your water intake was not recorded. Please try again.');
    }
  };

  const { greeting, icon } = getTimeGreeting();
  const userName = displayName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'User');

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
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
        },
        // Top Header
        topHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        },
        userInfoRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        avatarContainer: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isDark ? '#38BDF8' : '#0F172A',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        avatarText: {
          fontSize: 18,
          fontWeight: '900',
          color: '#FFFFFF',
        },
        greetingSub: {
          fontSize: 12,
          fontWeight: '500',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        userNameText: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.3,
        },
        bellButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        badgeDot: {
          position: 'absolute',
          top: 8,
          right: 8,
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: '#EF4444',
          borderWidth: 1.5,
          borderColor: '#FFFFFF',
        },

        // Calorie Hero Section
        calorieHeroSection: {
          marginBottom: 16,
        },
        calorieTopRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        },
        calorieNumberCol: {
          flex: 1,
          flexShrink: 1,
          marginRight: 12,
        },
        calorieLabel: {
          fontSize: 13,
          color: isDark ? '#94A3B8' : '#64748B',
          fontWeight: '500',
        },
        calorieValueRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 4,
          marginTop: 2,
        },
        calorieBigNumber: {
          fontSize: 34,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.8,
        },
        calorieUnitText: {
          fontSize: 14,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },

        // 3-Macro Row
        macroRow: {
          flexDirection: 'row',
          gap: 10,
          marginBottom: 20,
        },
        macroCard: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#F1F5F9',
          shadowColor: '#000',
          shadowOpacity: 0.03,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        macroIconBox: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        macroLabelText: {
          fontSize: 10,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        macroValueText: {
          fontSize: 11,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          marginTop: 1,
        },

        // Section Headers
        sectionTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          marginTop: 4,
        },
        sectionTitle: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.3,
        },
        seeAllText: {
          fontSize: 13,
          fontWeight: '700',
          color: '#3B82F6',
        },

        // Fitness & Activity Hero Card
        fitnessHeroCard: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          marginBottom: 16,
          gap: 12,
        },
        fitnessStatsGrid: {
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        fitnessStatItem: {
          alignItems: 'center',
          flex: 1,
        },
        fitnessStatIcon: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        },
        fitnessStatValue: {
          fontSize: 15,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        fitnessStatLabel: {
          fontSize: 11,
          color: isDark ? '#94A3B8' : '#64748B',
          fontWeight: '600',
        },
        fitnessHintText: {
          fontSize: 11,
          color: '#3B82F6',
          fontWeight: '700',
          textAlign: 'center',
          marginTop: 10,
        },

        // Vitals Grid (Hydration & Heart Rate)
        vitalGrid: {
          flexDirection: 'row',
          gap: 12,
          marginBottom: 16,
        },
        vitalCard: {
          flex: 1,
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#F1F5F9',
          shadowColor: '#000',
          shadowOpacity: 0.03,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        },
        vitalHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
        vitalTitle: {
          fontSize: 11,
          fontWeight: '800',
          color: isDark ? '#94A3B8' : '#64748B',
          textTransform: 'uppercase',
        },
        vitalValueRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 4,
        },
        vitalValue: {
          fontSize: 20,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        vitalUnitText: {
          fontSize: 13,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        vitalSub: {
          fontSize: 11,
          color: isDark ? '#64748B' : '#94A3B8',
          fontWeight: '600',
          marginTop: 2,
        },
        quickWaterRow: {
          flexDirection: 'row',
          gap: 6,
          marginTop: 10,
        },
        quickWaterBtn: {
          flex: 1,
          paddingVertical: 6,
          borderRadius: 10,
          backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
          alignItems: 'center',
          justifyContent: 'center',
        },
        quickWaterText: {
          fontSize: 10,
          fontWeight: '800',
          color: '#2563EB',
        },

        // Compact Meal Suggest Section
        compactMealRow: {
          flexDirection: 'row',
          gap: 12,
          marginBottom: 16,
        },
        compactMealCard: {
          flex: 1,
          borderRadius: 18,
          padding: 16,
          gap: 8,
          // Meal titles vary a lot in length once they come from real scans rather than the two
          // fixed strings this row used to hold; a floor keeps a one-line card the same height as
          // a two-line one so the row never looks half-collapsed.
          minHeight: 86,
          justifyContent: 'space-between',
        },
        compactMealTop: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 6,
        },
        compactMealTitle: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          // Without flex the title pushed the icon off the card once meal names came from real
          // scans instead of the two short fixed strings this row used to show.
          flex: 1,
          lineHeight: 17,
        },
        compactMealCals: {
          fontSize: 12,
          fontWeight: '700',
          color: '#64748B',
        },

        // Notifications Modal Styles
        modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          justifyContent: 'flex-end',
        },
        modalSheet: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: insets.bottom + 20,
          maxHeight: '75%',
        },
        modalHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        notifItem: {
          flexDirection: 'row',
          gap: 12,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#334155' : '#F1F5F9',
        },
        notifIconBox: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
        },
        notifContent: {
          flex: 1,
        },
        notifTitleRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        notifTitle: {
          fontSize: 14,
          fontWeight: '700',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        notifTime: {
          fontSize: 11,
          color: isDark ? '#94A3B8' : '#94A3B8',
          fontWeight: '500',
        },
        notifMessage: {
          fontSize: 12,
          color: isDark ? '#CBD5E1' : '#64748B',
          marginTop: 2,
          lineHeight: 16,
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Header: User Profile & Bell */}
        <View style={styles.topHeaderRow}>
          <Pressable
            style={styles.userInfoRow}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.greetingSub}>{greeting}</Text>
                <Ionicons name={icon} size={12} color={isDark ? '#94A3B8' : '#64748B'} />
              </View>
              <Text style={styles.userNameText}>{userName}</Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.bellButton}
            onPress={() => setShowAlertsModal(true)}
            accessibilityRole="button"
            accessibilityLabel={
              alerts.length > 0 ? `${alerts.length} daily alerts` : 'Daily alerts'
            }
          >
            <Ionicons name="notifications-outline" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
            {alerts.length > 0 ? <View style={styles.badgeDot} /> : null}
          </Pressable>
        </View>

        {/* Calorie Overview Hero Section */}
        <View style={styles.calorieHeroSection}>
          <View style={styles.calorieTopRow}>
            <View style={styles.calorieNumberCol}>
              <Text style={styles.calorieLabel}>Today calorie</Text>
              <View style={styles.calorieValueRow}>
                <Text style={styles.calorieBigNumber}>{todayCalories}</Text>
                <Text style={styles.calorieUnitText}>kcal</Text>
              </View>
            </View>
            <CircularProgressRing
              size={90}
              strokeWidth={9}
              progress={calorieProgress}
              leftLabel="Left"
              leftValue={caloriesLeft}
              ringColor={isDark ? '#38BDF8' : '#134E4A'}
              trackColor={isDark ? '#334155' : '#E2E8F0'}
              textColor={isDark ? '#F8FAFC' : '#0F172A'}
            />
          </View>

          {/* 3-Macro Row */}
          <View style={styles.macroRow}>
            {/* Carbs */}
            <View style={styles.macroCard}>
              <View style={[styles.macroIconBox, { backgroundColor: '#FFEDD5' }]}>
                <Ionicons name="pizza" size={16} color="#EA580C" />
              </View>
              <View>
                <Text style={styles.macroLabelText}>Carbs</Text>
                <Text style={styles.macroValueText}>{totalCarbs} /{macroTargets.carbsGrams}</Text>
              </View>
            </View>

            {/* Protein */}
            <View style={styles.macroCard}>
              <View style={[styles.macroIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="egg" size={16} color="#059669" />
              </View>
              <View>
                <Text style={styles.macroLabelText}>Protein</Text>
                <Text style={styles.macroValueText}>{totalProtein} /{macroTargets.proteinGrams}</Text>
              </View>
            </View>

            {/* Fat */}
            <View style={styles.macroCard}>
              <View style={[styles.macroIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="ice-cream" size={16} color="#D97706" />
              </View>
              <View>
                <Text style={styles.macroLabelText}>Fat</Text>
                <Text style={styles.macroValueText}>{totalFat} /{macroTargets.fatGrams}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Fitness & Daily Activity Hub */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Fitness & Activity</Text>
          <Pressable onPress={() => navigation.navigate('Health')}>
            <Text style={styles.seeAllText}>Hub Details</Text>
          </Pressable>
        </View>

        <View style={styles.fitnessHeroCard}>
          <View style={styles.fitnessStatsGrid}>
            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="footsteps" size={18} color="#7C3AED" />
              </View>
              <Text style={styles.fitnessStatValue}>
                {steps === null ? '—' : steps.toLocaleString()}
              </Text>
              <Text style={styles.fitnessStatLabel}>
                {stepsState.status === 'unavailable'
                  ? stepsState.reason === 'permission-denied'
                    ? 'Steps denied'
                    : 'No pedometer'
                  : 'Steps Today'}
              </Text>
            </View>

            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#FFEDD5' }]}>
                <Ionicons name="flame" size={18} color="#EA580C" />
              </View>
              <Text style={styles.fitnessStatValue}>
                {activeBurnKcal === null ? '—' : `${activeBurnKcal} kcal`}
              </Text>
              <Text style={styles.fitnessStatLabel}>Est. Burn</Text>
            </View>

            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="navigate" size={18} color="#0284C7" />
              </View>
              <Text style={styles.fitnessStatValue}>
                {distanceKm === null ? '—' : `${distanceKm.toFixed(1)} km`}
              </Text>
              <Text style={styles.fitnessStatLabel}>Est. Distance</Text>
            </View>

            {/*
              Replaces a hardcoded "45 min Active Time". Expo's Pedometer exposes only a cumulative
              step delta with no timestamps, so active minutes cannot be derived — step-goal
              progress is the honest metric this tile can actually report.
            */}
            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="trophy" size={18} color="#059669" />
              </View>
              <Text style={styles.fitnessStatValue}>
                {stepGoalPct === null ? '—' : `${stepGoalPct}%`}
              </Text>
              <Text style={styles.fitnessStatLabel}>Step Goal</Text>
            </View>
          </View>

          {(activeBurnKcal === null || distanceKm === null) && steps !== null ? (
            <Pressable
              onPress={() => navigation.navigate('Food', { screen: 'FoodHealthDetail' })}
              accessibilityRole="button"
            >
              <Text style={styles.fitnessHintText}>
                Add your height & weight to see distance and burn estimates
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Daily Vitals Grid (Hydration & Heart Rate) */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Daily Vitals</Text>
          <Pressable onPress={() => navigation.navigate('Health')}>
            <Text style={styles.seeAllText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.vitalGrid}>
          {/* Hydration Card */}
          <View style={styles.vitalCard}>
            <View style={styles.vitalHeader}>
              <Text style={styles.vitalTitle}>Hydration</Text>
              <Ionicons name="water" size={18} color="#0284C7" />
            </View>
            <View style={styles.vitalValueRow}>
              <Text style={styles.vitalValue}>
                {todayWater === null ? '—' : todayWater.toLocaleString()}
              </Text>
              <Text style={styles.vitalUnitText}>ml</Text>
            </View>
            <Text style={styles.vitalSub}>Target: {targetWater.toLocaleString()} ml</Text>
            <View style={styles.quickWaterRow}>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(250)}>
                <Text style={styles.quickWaterText}>+250ml</Text>
              </Pressable>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(500)}>
                <Text style={styles.quickWaterText}>+500ml</Text>
              </Pressable>
            </View>
          </View>

          {/*
            Heart rate is simulated — Expo exposes no HR sensor without HealthKit/Health Connect
            or a BLE wearable, none of which are available in a managed Expo Go build. The value
            is labelled SIMULATED in the UI so it can never be mistaken for a measurement, and
            the verdict below is derived from the displayed number rather than asserted.
            See src/services/heartRateService.ts.
          */}
          <View style={styles.vitalCard}>
            <View style={styles.vitalHeader}>
              <Text style={styles.vitalTitle}>Heart Rate</Text>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons name="heart" size={18} color="#EF4444" />
              </Animated.View>
            </View>
            <View style={styles.vitalValueRow}>
              <Text style={styles.vitalValue}>{bpm}</Text>
              <Text style={styles.vitalUnitText}>BPM</Text>
            </View>
            <Text style={styles.vitalSub}>Simulated — no HR sensor</Text>
            <View style={[styles.quickWaterRow, { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Ionicons
                name={bpm >= 60 && bpm <= 100 ? 'checkmark-circle' : 'alert-circle'}
                size={13}
                color={bpm >= 60 && bpm <= 100 ? '#10B981' : '#EA580C'}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: bpm >= 60 && bpm <= 100 ? '#10B981' : '#EA580C',
                  fontWeight: '800',
                }}
              >
                {bpm >= 60 && bpm <= 100 ? 'Within resting range' : 'Outside resting range'}
              </Text>
            </View>
          </View>
        </View>

        
        {/* Smart Habit Recommendations (ML Powered) */}
        <View style={styles.sectionTitleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={16} color="#6366F1" />
            <Text style={styles.sectionTitle}>Smart Habit Recommendations</Text>
          </View>
          <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#4F46E5' }}>AI Optimal</Text>
          </View>
        </View>

        <View style={{ gap: 10, marginBottom: 18 }}>
          {liveRecommendations.length > 0 ? (
            liveRecommendations.slice(0, 3).map((rec, index) => {
              // Orphans are filtered out above, so the habit is guaranteed to resolve — no
              // invented placeholder title.
              const matchedHabit = habits.find((h) => h.id === rec.habitId)!;
              const title = matchedHabit.title;
              // null below MIN_ATTEMPTS_FOR_CONFIDENCE logged attempts: with almost no history the
              // model's output is the prior, and printing it as a percentage would present an
              // absence of evidence as a measurement.
              const confidence = rec.confidence === null ? null : Math.round(rec.confidence * 100);

              return (
                <View
                  key={rec.habitId + index}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderRadius: 18,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                        {title}
                      </Text>
                      <View style={{ backgroundColor: confidence === null ? '#F1F5F9' : '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: confidence === null ? '#64748B' : '#059669' }}>
                          {confidence === null
                            ? `${rec.attempts}/${MIN_ATTEMPTS_FOR_CONFIDENCE} logs`
                            : `${confidence}% likely`}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color="#64748B" style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: '#64748B', lineHeight: 15 }}>
                        Recommended at <Text style={{ fontWeight: '800', color: '#4F46E5' }}>{rec.suggestedTime}</Text> · {rec.reason}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={{
                      backgroundColor: '#4F46E5',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                    }}
                    onPress={() => navigation.navigate('Activity', { screen: 'AddEditHabit' })}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>+ Add</Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <View
              style={{
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: isDark ? '#334155' : '#E2E8F0',
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles-outline" size={18} color="#6366F1" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  {recsLoaded ? 'No recommendations yet' : 'Loading recommendations'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 17 }}>
                {!recsLoaded
                  ? '—'
                  : habits.length === 0
                    ? 'Add a habit and log a few days — the model needs history before it can suggest a time.'
                    : 'Recommendations refresh nightly once you have logged a few completions.'}
              </Text>
              {weatherMessage ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 2 }}>
                  <Ionicons name="partly-sunny-outline" size={13} color="#0284C7" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 11, color: '#0284C7', lineHeight: 16, fontWeight: '600' }}>
                    {weatherMessage}
                  </Text>
                </View>
              ) : null}
              {habits.length > 0 ? (
                <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 2 }}>
                  {habitsDoneToday}/{habits.length} habits completed today
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Today's logged meals. FoodLog has no meal-slot field, so breakfast/lunch cannot be
            reconstructed — the previous "Sandwich / Red Rice" cards were invented. This shows what
            the user actually scanned, or an honest prompt when nothing is logged. */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>
          <Pressable onPress={() => navigation.navigate('Food')}>
            <Text style={styles.seeAllText}>Scan Meal</Text>
          </Pressable>
        </View>

        <View style={styles.compactMealRow}>
          {todayFoodLogs.length > 0 ? (
            todayFoodLogs.slice(0, 2).map((log, i) => (
              <Pressable
                key={log.id ?? i}
                style={[
                  styles.compactMealCard,
                  { backgroundColor: isDark ? '#1E293B' : i === 0 ? '#EAF4FD' : '#F2ECFE' },
                ]}
                onPress={() => navigation.navigate('Food')}
              >
                <View style={styles.compactMealTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="restaurant" size={15} color={i === 0 ? '#0284C7' : '#7C3AED'} />
                    <Text style={styles.compactMealTitle} numberOfLines={2}>
                      {log.mealTitle || 'Scanned meal'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.compactMealCals}>
                  {(log.totalCalories ?? 0).toLocaleString()} kcal
                </Text>
              </Pressable>
            ))
          ) : (
            <Pressable
              style={[
                styles.compactMealCard,
                { flex: 1, backgroundColor: isDark ? '#1E293B' : '#EAF4FD' },
              ]}
              onPress={() => navigation.navigate('Food')}
            >
              <View style={styles.compactMealTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="camera-outline" size={15} color="#0284C7" />
                  <Text style={styles.compactMealTitle}>
                    {foodLoaded ? 'No meals logged yet' : '—'}
                  </Text>
                </View>
                <Ionicons name="add-circle" size={20} color="#0284C7" />
              </View>
              <Text style={styles.compactMealCals}>
                {foodLoaded ? 'Tap to scan a meal' : ''}
              </Text>
            </Pressable>
          )}
        </View>

      </ScrollView>

      {/* Daily alerts, derived from today's real logged state (utils/dashboardAlerts.ts).
          There is no read/unread state because these describe the current day, not past events. */}
      <Modal
        visible={showAlertsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAlertsModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAlertsModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalTitle}>Today</Text>
                {alerts.length > 0 ? (
                  <View style={{ backgroundColor: '#6366F1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                      {alerts.length}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Pressable onPress={() => setShowAlertsModal(false)} accessibilityRole="button">
                <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '700' }}>Done</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {alerts.length === 0 ? (
                <View style={[styles.notifItem, { justifyContent: 'center' }]}>
                  <Text style={styles.notifMessage}>
                    Nothing to flag yet. Log water, meals or habits and updates will appear here.
                  </Text>
                </View>
              ) : (
                alerts.map((a) => (
                  <View key={a.id} style={styles.notifItem}>
                    <View style={[styles.notifIconBox, { backgroundColor: a.bg }]}>
                      <Ionicons name={a.icon} size={20} color={a.color} />
                    </View>
                    <View style={styles.notifContent}>
                      <View style={styles.notifTitleRow}>
                        <Text style={styles.notifTitle}>{a.title}</Text>
                      </View>
                      <Text style={styles.notifMessage}>{a.message}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
