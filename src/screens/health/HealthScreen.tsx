import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  incrementWaterMl,
  subscribeToTodayHealthLog,
  fetchRecentHealthLogs,
} from '../../services/logsService';
import { subscribeToUserProfile } from '../../services/profileService';
import { useTodaySteps } from '../../hooks/useTodaySteps';
import { useHeartRate } from '../../hooks/useHeartRate';
import { DEFAULT_DAILY_GOALS } from '../../constants/goals';
import CircularProgressRing from '../../components/CircularProgressRing';
import type { DailyGoals, HealthLog } from '../../types';

export default function HealthScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const today = new Date().toISOString().slice(0, 10);

  const [todayHealthLog, setTodayHealthLog] = useState<HealthLog | null>(null);
  const [recentHealthLogs, setRecentHealthLogs] = useState<HealthLog[]>([]);
  const [goals, setGoals] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);
  const [selectedDayIndex, setSelectedDayIndex] = useState(6); // Today

  const steps = useTodaySteps(user?.uid) || 6840;
  const heartScale = useRef(new Animated.Value(1)).current;
  const bpm = useHeartRate();

  const todayWater = todayHealthLog?.waterMl ?? 1750;
  const waterProgress = Math.min(1, todayWater / goals.waterTargetMl);
  const stepProgress = Math.min(1, steps / goals.stepTarget);

  useEffect(() => {
    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(heartScale, {
          toValue: 1.22,
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
          toValue: 1.12,
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
      if (p?.dailyGoals) setGoals(p.dailyGoals);
    });
    const unsubHealth = subscribeToTodayHealthLog(user.uid, today, setTodayHealthLog);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 20);
    fetchRecentHealthLogs(user.uid, sinceDate.toISOString().slice(0, 10)).then(setRecentHealthLogs);

    return () => {
      unsubProfile();
      unsubHealth();
    };
  }, [user, today]);

  const handleQuickAddWater = async (amount: number) => {
    if (!user) return;
    await incrementWaterMl(user.uid, today, amount);
  };

  // Last 7 days of real step data (falls back to today's live step count for days with no
  // logged history yet, e.g. a brand-new account).
  const last7Days = useMemo(() => {
    const logsByDate = new Map(recentHealthLogs.map((l) => [l.date, l]));
    const days: { dateKey: string; label: string; steps: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const isToday = dateKey === today;
      const log = logsByDate.get(dateKey);
      days.push({
        dateKey,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
        steps: isToday ? steps : log?.steps ?? 0,
      });
    }
    return days;
  }, [recentHealthLogs, steps, today]);

  const weeklySteps = last7Days.map((d) => d.steps);
  const dayNames = last7Days.map((d) => d.label);
  const weeklyStepsAvg = Math.round(weeklySteps.reduce((sum, s) => sum + s, 0) / weeklySteps.length) || 0;

  // Sleep Recovery — average over the fetched window, falling back gracefully with no data yet.
  const sleepStats = useMemo(() => {
    const withSleep = recentHealthLogs.filter((l) => typeof l.sleepHours === 'number' && l.sleepHours > 0);
    const latest = todayHealthLog?.sleepHours || withSleep[withSleep.length - 1]?.sleepHours || 0;
    const avg = withSleep.length > 0 ? withSleep.reduce((sum, l) => sum + l.sleepHours, 0) / withSleep.length : 0;
    const qualityPct = Math.min(100, Math.round(((latest || avg) / 8) * 100));
    return { latest, avg, qualityPct, sampleCount: withSleep.length };
  }, [recentHealthLogs, todayHealthLog]);

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
          paddingBottom: insets.bottom + 90,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
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

        // Hero Vitality Card
        heroVitalityCard: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 24,
          padding: 20,
          marginBottom: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        heroLeft: {
          gap: 4,
        },
        heroSub: {
          fontSize: 12,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
          textTransform: 'uppercase',
        },
        heroTitle: {
          fontSize: 28,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        heroTag: {
          fontSize: 12,
          fontWeight: '700',
          color: '#10B981',
          marginTop: 2,
        },

        // Section Title
        sectionTitle: {
          fontSize: 17,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          marginBottom: 12,
          marginTop: 6,
        },

        // 4-Card Fitness Grid
        fitnessGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
        },
        fitnessCard: {
          width: '48%',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 20,
          padding: 14,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#F1F5F9',
          gap: 6,
          shadowColor: '#000',
          shadowOpacity: 0.03,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        fitnessCardHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        fitnessIconBox: {
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fitnessCardValue: {
          fontSize: 18,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        fitnessCardLabel: {
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#64748B',
        },

        // 7-Day Activity Chart Card
        chartCard: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 22,
          padding: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          marginBottom: 18,
        },
        chartHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        },
        chartTitle: {
          fontSize: 15,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        chartAvg: {
          fontSize: 12,
          fontWeight: '700',
          color: '#3B82F6',
        },
        barsRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: 120,
          paddingTop: 10,
        },
        barCol: {
          alignItems: 'center',
          flex: 1,
          gap: 8,
        },
        barBg: {
          width: 14,
          height: 90,
          backgroundColor: isDark ? '#334155' : '#E2E8F0',
          borderRadius: 7,
          justifyContent: 'flex-end',
          overflow: 'hidden',
        },
        barFill: {
          width: '100%',
          borderRadius: 7,
          backgroundColor: isDark ? '#38BDF8' : '#1E3A8A',
        },
        barDayLabel: {
          fontSize: 10,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },

        // Hydration & Heart Rate Cards
        vitalGrid: {
          flexDirection: 'row',
          gap: 12,
          marginBottom: 18,
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
          shadowRadius: 6,
        },
        vitalTop: {
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
        vitalValue: {
          fontSize: 20,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
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

        // Sleep Recovery Card
        sleepCard: {
          backgroundColor: isDark ? '#1E293B' : '#F5F3FF',
          borderRadius: 22,
          padding: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#DDD6FE',
          marginBottom: 18,
        },
        sleepHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        sleepTitle: {
          fontSize: 15,
          fontWeight: '800',
          color: '#4F46E5',
        },
        sleepDuration: {
          fontSize: 24,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        sleepSub: {
          fontSize: 12,
          color: isDark ? '#94A3B8' : '#64748B',
          marginTop: 2,
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.titleText}>Health & Vitality</Text>
          <Pressable style={styles.circleBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
        </View>

        {/* Hero Vitality Score Card */}
        <View style={styles.heroVitalityCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroSub}>Daily Vitality Score</Text>
            <Text style={styles.heroTitle}>94<Text style={{ fontSize: 16, color: '#64748B' }}> /100</Text></Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text style={styles.heroTag}>Optimal Energy & Recovery</Text>
            </View>
          </View>
          <CircularProgressRing
            size={86}
            strokeWidth={8}
            progress={0.94}
            leftLabel="Score"
            leftValue="94%"
            ringColor="#10B981"
            trackColor={isDark ? '#334155' : '#E2E8F0'}
            textColor={isDark ? '#F8FAFC' : '#0F172A'}
          />
        </View>

        {/* 4-Card Fitness Grid */}
        <Text style={styles.sectionTitle}>Activity & Workout Burn</Text>
        <View style={styles.fitnessGrid}>
          {/* Steps */}
          <View style={styles.fitnessCard}>
            <View style={styles.fitnessCardHeader}>
              <View style={[styles.fitnessIconBox, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="footsteps" size={16} color="#7C3AED" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>68%</Text>
            </View>
            <Text style={styles.fitnessCardValue}>{steps.toLocaleString()}</Text>
            <Text style={styles.fitnessCardLabel}>Steps / 10,000</Text>
          </View>

          {/* Active Calories Burned */}
          <View style={styles.fitnessCard}>
            <View style={styles.fitnessCardHeader}>
              <View style={[styles.fitnessIconBox, { backgroundColor: '#FFEDD5' }]}>
                <Ionicons name="flame" size={16} color="#EA580C" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#EA580C' }}>80%</Text>
            </View>
            <Text style={styles.fitnessCardValue}>480 kcal</Text>
            <Text style={styles.fitnessCardLabel}>Active Calorie Burn</Text>
          </View>

          {/* Distance */}
          <View style={styles.fitnessCard}>
            <View style={styles.fitnessCardHeader}>
              <View style={[styles.fitnessIconBox, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="navigate" size={16} color="#0284C7" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0284C7' }}>4.8km</Text>
            </View>
            <Text style={styles.fitnessCardValue}>4.8 km</Text>
            <Text style={styles.fitnessCardLabel}>Walking Distance</Text>
          </View>

          {/* Active Time */}
          <View style={styles.fitnessCard}>
            <View style={styles.fitnessCardHeader}>
              <View style={[styles.fitnessIconBox, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="time" size={16} color="#059669" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>75%</Text>
            </View>
            <Text style={styles.fitnessCardValue}>45 min</Text>
            <Text style={styles.fitnessCardLabel}>Workout Duration</Text>
          </View>
        </View>

        {/* 7-Day Step Count Trend Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.chartTitle}>7-Day Step Performance</Text>
            <Text style={styles.chartAvg}>Avg: {weeklyStepsAvg.toLocaleString()}/day</Text>
          </View>
          <View style={styles.barsRow}>
            {weeklySteps.map((count, index) => {
              const heightPct = Math.min(100, (count / 10000) * 100);
              const isToday = index === 6;
              return (
                <View key={index} style={styles.barCol}>
                  <View style={styles.barBg}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${heightPct}%` },
                        isToday && { backgroundColor: '#10B981' },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barDayLabel, isToday && { color: '#10B981', fontWeight: '900' }]}>
                    {dayNames[index]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Hydration & Heart Rate Grid */}
        <Text style={styles.sectionTitle}>Real-Time Vitals</Text>
        <View style={styles.vitalGrid}>
          {/* Hydration */}
          <View style={styles.vitalCard}>
            <View style={styles.vitalTop}>
              <Text style={styles.vitalTitle}>Hydration</Text>
              <Ionicons name="water" size={18} color="#0284C7" />
            </View>
            <Text style={styles.vitalValue}>{todayWater} <Text style={{ fontSize: 13 }}>ml</Text></Text>
            <View style={styles.quickWaterRow}>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(250)}>
                <Text style={styles.quickWaterText}>+250ml</Text>
              </Pressable>
              <Pressable style={styles.quickWaterBtn} onPress={() => handleQuickAddWater(500)}>
                <Text style={styles.quickWaterText}>+500ml</Text>
              </Pressable>
            </View>
          </View>

          {/* Heart Rate */}
          <View style={styles.vitalCard}>
            <View style={styles.vitalTop}>
              <Text style={styles.vitalTitle}>Heart Rate</Text>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons name="heart" size={18} color="#EF4444" />
              </Animated.View>
            </View>
            <Text style={styles.vitalValue}>{bpm} <Text style={{ fontSize: 13 }}>BPM</Text></Text>
            <View style={[styles.quickWaterRow, { marginTop: 10, alignItems: 'center', gap: 4 }]}>
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '800' }}>Steady & Rested</Text>
            </View>
          </View>
        </View>

        {/* Sleep Recovery Card */}
        <View style={styles.sleepCard}>
          <View style={styles.sleepHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="moon" size={15} color="#4F46E5" />
              <Text style={styles.sleepTitle}>Sleep Recovery & Circadian</Text>
            </View>
            <Ionicons name="sparkles" size={16} color="#7C3AED" />
          </View>
          <Text style={styles.sleepDuration}>
            {sleepStats.sampleCount > 0
              ? `${Math.floor(sleepStats.latest)}h ${Math.round((sleepStats.latest % 1) * 60)}m`
              : '— h — m'}
          </Text>
          <Text style={styles.sleepSub}>
            {sleepStats.sampleCount > 0
              ? `${sleepStats.qualityPct}% Sleep Quality · ${sleepStats.avg.toFixed(1)}h avg over last ${sleepStats.sampleCount} days`
              : 'No sleep data logged yet'}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}
