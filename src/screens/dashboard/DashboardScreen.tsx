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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToRecommendations } from '../../services/recommendationsService';
import { subscribeToHabits } from '../../services/habitsService';
import { getCurrentWeather, weatherTip } from '../../services/weatherService';
import { subscribeToTodayFoodLogs } from '../../services/foodService';
import {
  incrementWaterMl,
  subscribeToTodayHealthLog,
  fetchRecentHabitLogs,
  logHabitCompletion,
} from '../../services/logsService';
import { subscribeToUserProfile } from '../../services/profileService';
import { useTodaySteps } from '../../hooks/useTodaySteps';
import { useHeartRate } from '../../hooks/useHeartRate';
import { DEFAULT_DAILY_GOALS } from '../../constants/goals';
import { TAB_BAR_CLEARANCE } from '../../constants/layout';
import CircularProgressRing from '../../components/CircularProgressRing';
import type { DailyGoals, FoodLog, HealthLog, Habit, Recommendation } from '../../types';

interface FakeNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: FakeNotification[] = [
  {
    id: 'n1',
    title: 'Hydration Milestone',
    message: 'Drink 250ml water now to maintain your peak hydration streak!',
    time: '10m ago',
    icon: 'water',
    color: '#0284C7',
    bg: '#E0F2FE',
    read: false,
  },
  {
    id: 'n2',
    title: 'Meal Log Reminder',
    message: 'Remember to scan your lunch to evaluate Sri Lankan veggie nutrients & habits.',
    time: '1h ago',
    icon: 'restaurant',
    color: '#059669',
    bg: '#D1FAE5',
    read: false,
  },
  {
    id: 'n3',
    title: '5-Day Habit Streak!',
    message: 'Awesome consistency! You have completed 100% of your morning habits.',
    time: '3h ago',
    icon: 'flame',
    color: '#EA580C',
    bg: '#FFEDD5',
    read: false,
  },
  {
    id: 'n4',
    title: 'Daily Steps Goal: 68%',
    message: '6,840 steps completed today. Just 3,160 steps left to hit 10,000!',
    time: '5h ago',
    icon: 'footsteps',
    color: '#7C3AED',
    bg: '#EDE9FE',
    read: true,
  },
  {
    id: 'n5',
    title: 'Sleep Recovery Ready',
    message: 'Your optimal bedtime tonight is 10:30 PM for 8 hours of restorative sleep.',
    time: 'Yesterday',
    icon: 'moon',
    color: '#4F46E5',
    bg: '#E0E7FF',
    read: true,
  },
];

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
  const today = new Date().toISOString().slice(0, 10);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null);
  const [todayFoodLogs, setTodayFoodLogs] = useState<FoodLog[]>([]);
  const [todayHealthLog, setTodayHealthLog] = useState<HealthLog | null>(null);
  const [goals, setGoals] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);
  const [displayName, setDisplayName] = useState<string>('');
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  
  // Notification Modal State
  const [notifications, setNotifications] = useState<FakeNotification[]>(INITIAL_NOTIFICATIONS);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const steps = useTodaySteps(user?.uid) || 6840;
  const heartScale = useRef(new Animated.Value(1)).current;
  const bpm = useHeartRate();

  const loggedCalories = todayFoodLogs.reduce((sum, log) => sum + log.totalCalories, 0);
  const todayCalories = loggedCalories > 0 ? loggedCalories : 2145;
  const targetCalories = goals.calorieTarget || 2665;
  const caloriesLeft = Math.max(0, targetCalories - todayCalories) || 520;
  const calorieProgress = Math.min(1, todayCalories / targetCalories);

  // Macros Calculation
  const totalCarbs = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.carbsGrams || 0), 0) || 231;
  const totalProtein = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.proteinGrams || 0), 0) || 51;
  const totalFat = todayFoodLogs.reduce((sum, log) => sum + (log.macros?.fatGrams || 0), 0) || 131;

  const targetCarbs = 412;
  const targetProtein = 132;
  const targetFat = 180;

  const todayWater = todayHealthLog?.waterMl ?? 1750;
  const unreadCount = notifications.filter((n) => !n.read).length;

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
    if (!user) return;
    const unsubProfile = subscribeToUserProfile(user.uid, (p) => {
      if (p?.displayName) setDisplayName(p.displayName);
      if (p?.dailyGoals) setGoals(p.dailyGoals);
    });
    const unsubRecs = subscribeToRecommendations(user.uid, setRecommendations);
    const unsubHabits = subscribeToHabits(user.uid, setHabits);
    const unsubFood = subscribeToTodayFoodLogs(user.uid, today, setTodayFoodLogs);
    const unsubHealth = subscribeToTodayHealthLog(user.uid, today, setTodayHealthLog);

    getCurrentWeather().then((w) => {
      if (w) setWeatherMessage(weatherTip(w));
    });

    fetchRecentHabitLogs(user.uid, today).then((logs) => {
      const done = new Set(logs.filter((l) => l.success && l.date === today).map((l) => l.habitId));
      setCompletedTodayIds(done);
    });

    return () => {
      unsubProfile();
      unsubRecs();
      unsubHabits();
      unsubFood();
      unsubHealth();
    };
  }, [user, today]);

  const handleQuickAddWater = async (amount: number) => {
    if (!user) return;
    await incrementWaterMl(user.uid, today, amount);
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
        },
        compactMealTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        compactMealTitle: {
          fontSize: 14,
          fontWeight: '800',
          color: '#0F172A',
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
            onPress={() => setShowNotificationsModal(true)}
            accessibilityRole="button"
          >
            <Ionicons name="notifications-outline" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
            {unreadCount > 0 ? <View style={styles.badgeDot} /> : null}
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
                <Text style={styles.macroValueText}>{totalCarbs} /{targetCarbs}</Text>
              </View>
            </View>

            {/* Protein */}
            <View style={styles.macroCard}>
              <View style={[styles.macroIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="egg" size={16} color="#059669" />
              </View>
              <View>
                <Text style={styles.macroLabelText}>Protein</Text>
                <Text style={styles.macroValueText}>{totalProtein} /{targetProtein}</Text>
              </View>
            </View>

            {/* Fat */}
            <View style={styles.macroCard}>
              <View style={[styles.macroIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="ice-cream" size={16} color="#D97706" />
              </View>
              <View>
                <Text style={styles.macroLabelText}>Fat</Text>
                <Text style={styles.macroValueText}>{totalFat} /{targetFat}</Text>
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
              <Text style={styles.fitnessStatValue}>{steps.toLocaleString()}</Text>
              <Text style={styles.fitnessStatLabel}>Steps Today</Text>
            </View>

            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#FFEDD5' }]}>
                <Ionicons name="flame" size={18} color="#EA580C" />
              </View>
              <Text style={styles.fitnessStatValue}>480 kcal</Text>
              <Text style={styles.fitnessStatLabel}>Active Burn</Text>
            </View>

            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="navigate" size={18} color="#0284C7" />
              </View>
              <Text style={styles.fitnessStatValue}>4.8 km</Text>
              <Text style={styles.fitnessStatLabel}>Distance</Text>
            </View>

            <View style={styles.fitnessStatItem}>
              <View style={[styles.fitnessStatIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="time" size={18} color="#059669" />
              </View>
              <Text style={styles.fitnessStatValue}>45 min</Text>
              <Text style={styles.fitnessStatLabel}>Active Time</Text>
            </View>
          </View>
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
              <Text style={styles.vitalValue}>{todayWater}</Text>
              <Text style={styles.vitalUnitText}>ml</Text>
            </View>
            <Text style={styles.vitalSub}>Target: {goals.waterTargetMl} ml</Text>
            <View style={styles.quickWaterRow}>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(250)}>
                <Text style={styles.quickWaterText}>+250ml</Text>
              </Pressable>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(500)}>
                <Text style={styles.quickWaterText}>+500ml</Text>
              </Pressable>
            </View>
          </View>

          {/* Heart Rate Card */}
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
            <Text style={styles.vitalSub}>Optimal Resting Pulse</Text>
            <View style={[styles.quickWaterRow, { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '800' }}>100% Healthy</Text>
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
          {recommendations.length > 0 ? (
            recommendations.slice(0, 3).map((rec, index) => {
              const matchedHabit = habits.find((h) => h.id === rec.habitId);
              const title = matchedHabit?.title || 'Daily Habit Session';
              const confidence = Math.round((rec.score || 0.85) * 100);

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
                      <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>
                          {confidence}% Peak
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
                padding: 14,
                borderWidth: 1,
                borderColor: isDark ? '#334155' : '#E2E8F0',
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sunny-outline" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                    Morning Hydration & Sunlight Walk
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    07:30 AM · Circadian Cortisol Peak
                  </Text>
                </View>
                <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>94% Success</Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderTopWidth: 1,
                  borderTopColor: isDark ? '#334155' : '#F1F5F9',
                  paddingTop: 12,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="book-outline" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                    Deep Focus Study & Learning
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                    08:30 PM · Evening Alpha Waves
                  </Text>
                </View>
                <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>91% Success</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Compact Meal Suggest Section */}

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Meal Suggest</Text>
          <Pressable onPress={() => navigation.navigate('Food')}>
            <Text style={styles.seeAllText}>Scan Meal</Text>
          </Pressable>
        </View>

        <View style={styles.compactMealRow}>
          {/* Breakfast */}
          <Pressable
            style={[styles.compactMealCard, { backgroundColor: isDark ? '#1E293B' : '#EAF4FD' }]}
            onPress={() => navigation.navigate('Food')}
          >
            <View style={styles.compactMealTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cafe" size={15} color="#0284C7" />
                <Text style={styles.compactMealTitle}>Breakfast</Text>
              </View>
              <Ionicons name="add-circle" size={20} color="#0284C7" />
            </View>
            <Text style={styles.compactMealCals}>Sandwich · 344 kcal</Text>
          </Pressable>

          {/* Lunch */}
          <Pressable
            style={[styles.compactMealCard, { backgroundColor: isDark ? '#1E293B' : '#F2ECFE' }]}
            onPress={() => navigation.navigate('Food')}
          >
            <View style={styles.compactMealTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="restaurant" size={15} color="#7C3AED" />
                <Text style={styles.compactMealTitle}>Lunch</Text>
              </View>
              <Ionicons name="add-circle" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.compactMealCals}>Red Rice · 320 kcal</Text>
          </Pressable>
        </View>

      </ScrollView>

      {/* Interactive Notifications Bottom Sheet Modal */}
      <Modal
        visible={showNotificationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotificationsModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalTitle}>Notifications</Text>
                {unreadCount > 0 ? (
                  <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{unreadCount} New</Text>
                  </View>
                ) : null}
              </View>
              <Pressable onPress={markAllNotificationsRead}>
                <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '700' }}>Mark all read</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.map((n) => (
                <View key={n.id} style={styles.notifItem}>
                  <View style={[styles.notifIconBox, { backgroundColor: n.bg }]}>
                    <Ionicons name={n.icon} size={20} color={n.color} />
                  </View>
                  <View style={styles.notifContent}>
                    <View style={styles.notifTitleRow}>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifTime}>{n.time}</Text>
                    </View>
                    <Text style={styles.notifMessage}>{n.message}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
