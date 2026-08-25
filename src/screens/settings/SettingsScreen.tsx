import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  subscribeToUserProfile,
  updateDailyGoals,
  updateNotificationsEnabled,
} from '../../services/profileService';
import { subscribeToTodayFoodLogs } from '../../services/foodService';
import { subscribeToTodayHealthLog } from '../../services/logsService';
import { exportUserData, exportUserDataAsPdf, deleteUserAccount } from '../../services/exportService';
import { useTodaySteps } from '../../hooks/useTodaySteps';
import { DEFAULT_DAILY_GOALS } from '../../constants/goals';
import type { DailyGoals, FoodLog, HealthLog } from '../../types';

function getTimeGreeting(): { greeting: string; icon: keyof typeof Ionicons.glyphMap } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good morning', icon: 'sunny' };
  if (hour < 17) return { greeting: 'Good afternoon', icon: 'partly-sunny' };
  return { greeting: 'Good evening', icon: 'moon' };
}

const AVATAR_PRESETS: (keyof typeof Ionicons.glyphMap)[] = [
  'laptop-outline',
  'walk',
  'body-outline',
  'star',
  'flash',
  'nutrition',
  'flower',
  'flame',
  'barbell',
  'ribbon',
];

export default function SettingsScreen() {
  const { user, logOut } = useAuth();
  const { scheme, setScheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const today = new Date().toISOString().slice(0, 10);

  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  const [goals, setGoals] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);
  const [todayFoodLogs, setTodayFoodLogs] = useState<FoodLog[]>([]);
  const [todayHealthLog, setTodayHealthLog] = useState<HealthLog | null>(null);

  const [calorieTarget, setCalorieTarget] = useState(String(DEFAULT_DAILY_GOALS.calorieTarget));
  const [waterTargetMl, setWaterTargetMl] = useState(String(DEFAULT_DAILY_GOALS.waterTargetMl));
  const [stepTarget, setStepTarget] = useState(String(DEFAULT_DAILY_GOALS.stepTarget));
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [goalsSaved, setGoalsSaved] = useState(false);

  // Edit Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const stepsCount = useTodaySteps(user?.uid) || 5500;
  const loggedCalories = todayFoodLogs.reduce((sum, l) => sum + l.totalCalories, 0);
  const currentCalories = loggedCalories > 0 ? loggedCalories : 1450;
  const currentWater = todayHealthLog?.waterMl ?? 1200;

  const targetCals = goals.calorieTarget || 2000;
  const targetWater = goals.waterTargetMl || 2500;
  const targetSteps = goals.stepTarget || 8000;

  const calProgress = Math.min(1, currentCalories / targetCals);
  const waterProgress = Math.min(1, currentWater / targetWater);
  const stepProgress = Math.min(1, stepsCount / targetSteps);

  useEffect(() => {
    if (!user) return;
    const unsubProfile = subscribeToUserProfile(user.uid, (p) => {
      if (!p) return;
      if (p.displayName) {
        setDisplayName(p.displayName);
        setEditingName(p.displayName);
      }
      if ((p as any).avatarUri) setAvatarUri((p as any).avatarUri);
      if ((p as any).avatarEmoji) setSelectedEmoji((p as any).avatarEmoji);
      if (p.dailyGoals) {
        setGoals(p.dailyGoals);
        setCalorieTarget(String(p.dailyGoals.calorieTarget));
        setWaterTargetMl(String(p.dailyGoals.waterTargetMl));
        setStepTarget(String(p.dailyGoals.stepTarget));
      }
      if (p.notificationsEnabled !== undefined) setNotificationsEnabled(p.notificationsEnabled);
    });

    const unsubFood = subscribeToTodayFoodLogs(user.uid, today, setTodayFoodLogs);
    const unsubHealth = subscribeToTodayHealthLog(user.uid, today, setTodayHealthLog);

    return () => {
      unsubProfile();
      unsubFood();
      unsubHealth();
    };
  }, [user, today]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      setSelectedEmoji(null);
      if (user) {
        setDoc(doc(db, 'users', user.uid), { avatarUri: uri, avatarEmoji: null }, { merge: true }).catch(() => {});
      }
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setSelectedEmoji(emoji);
    setAvatarUri(null);
    if (user) {
      setDoc(doc(db, 'users', user.uid), { avatarEmoji: emoji, avatarUri: null }, { merge: true }).catch(() => {});
    }
  };

  const handleSaveProfileDetails = async () => {
    if (!user || savingProfile) return;
    setSavingProfile(true);
    const cleanName = editingName.trim() || 'User';
    setDisplayName(cleanName);
    try {
      await setDoc(doc(db, 'users', user.uid), { displayName: cleanName }, { merge: true });
      setSavingProfile(false);
      setProfileSaved(true);
      setTimeout(() => {
        setProfileSaved(false);
        setShowEditModal(false);
      }, 1200);
    } catch {
      setSavingProfile(false);
      setShowEditModal(false);
    }
  };

  const handleSaveGoals = async () => {
    if (!user) return;
    const newGoals: DailyGoals = {
      calorieTarget: parseInt(calorieTarget, 10) || DEFAULT_DAILY_GOALS.calorieTarget,
      waterTargetMl: parseInt(waterTargetMl, 10) || DEFAULT_DAILY_GOALS.waterTargetMl,
      stepTarget: parseInt(stepTarget, 10) || DEFAULT_DAILY_GOALS.stepTarget,
    };
    await updateDailyGoals(user.uid, newGoals);
    setGoals(newGoals);
    setGoalsSaved(true);
    setTimeout(() => setGoalsSaved(false), 2500);
  };

  const handleToggleNotifications = async (val: boolean) => {
    if (!user) return;
    setNotificationsEnabled(val);
    await updateNotificationsEnabled(user.uid, val);
  };

  const handleExport = async () => {
    if (!user) return;
    try {
      await exportUserData(user.uid);
    } catch {
      Alert.alert('Export Failed', 'Could not export user data.');
    }
  };

  const handleExportPdf = async () => {
    if (!user || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportUserDataAsPdf(user.uid);
    } catch {
      Alert.alert('Export Failed', 'Could not generate the PDF report.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Account', 'Are you sure you want to permanently delete your data?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user) return;
          await deleteUserAccount(user.uid);
          await logOut();
        },
      },
    ]);
  };

  const { greeting, icon } = getTimeGreeting();
  const userName = displayName || (user?.email ? user.email.split('@')[0] : 'User');
  const userInitial = userName.charAt(0).toUpperCase();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: isDark ? '#0B0D17' : '#F4F7FB',
        },
        container: {
          paddingHorizontal: 18,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 90,
          gap: 16,
        },

        // Top Profile Card (Exact Mockup Header)
        topProfileCard: {
          backgroundColor: isDark ? '#1E293B' : 'rgba(255, 255, 255, 0.85)',
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        avatarRainbowRing: {
          width: 52,
          height: 52,
          borderRadius: 26,
          padding: 2.5,
          backgroundColor: '#3B82F6',
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarInnerCircle: {
          width: '100%',
          height: '100%',
          borderRadius: 24,
          backgroundColor: isDark ? '#1E293B' : '#6366F1',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        avatarLetter: {
          color: '#FFFFFF',
          fontSize: 18,
          fontWeight: '900',
        },
        profileInfoCol: {
          flex: 1,
          gap: 2,
        },
        profileNameText: {
          fontSize: 16,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        profileEmailText: {
          fontSize: 12,
          color: isDark ? '#94A3B8' : '#64748B',
        },
        memberBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: isDark ? '#0F172A' : '#FDF2F8',
          borderWidth: 1,
          borderColor: '#F472B6',
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
          alignSelf: 'flex-start',
          marginTop: 2,
        },
        memberBadgeText: {
          fontSize: 10,
          fontWeight: '800',
          color: '#DB2777',
        },

        // Greeting Header
        greetingTitle: {
          fontSize: 22,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.4,
          marginTop: 2,
        },

        // Card 1: Today's Progress
        progressCard: {
          backgroundColor: isDark ? '#1E293B' : '#EDF5FC',
          borderRadius: 24,
          padding: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#D9E8F5',
          gap: 12,
        },
        progressCardTitle: {
          fontSize: 16,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        vitalsGrid: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingVertical: 4,
        },
        vitalCol: {
          alignItems: 'center',
          flex: 1,
          gap: 8,
        },
        vitalColTitle: {
          fontSize: 12,
          fontWeight: '700',
          color: isDark ? '#CBD5E1' : '#475569',
        },
        vitalColVal: {
          fontSize: 11,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
          textAlign: 'center',
        },

        // Vertical Thermometer Gauge
        thermoTrack: {
          width: 24,
          height: 84,
          borderRadius: 12,
          backgroundColor: isDark ? '#334155' : '#DCE8F2',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 4,
          overflow: 'hidden',
        },
        thermoFillTeal: {
          width: '100%',
          backgroundColor: '#0D9488',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 4,
        },
        thermoFillPink: {
          width: '100%',
          backgroundColor: '#D946EF',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 4,
        },

        // Card 2: Daily Routine
        routineSectionHeader: {
          fontSize: 16,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          marginTop: 4,
        },
        routineGrid: {
          flexDirection: 'row',
          gap: 10,
        },
        routineCard: {
          flex: 1,
          borderRadius: 20,
          padding: 12,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: 110,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
        routineCardText: {
          fontSize: 11,
          fontWeight: '800',
          textAlign: 'center',
          color: '#0F172A',
        },
        routineCardSub: {
          fontSize: 10,
          fontWeight: '700',
          color: '#475569',
          textAlign: 'center',
        },

        // Card 3: AI Coach Insight
        aiCoachCard: {
          backgroundColor: isDark ? '#1E293B' : '#FAF5FF',
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E9D5FF',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        },
        aiRobotBox: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#EDE9FE',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: '#C084FC',
        },
        aiCoachTitle: {
          fontSize: 14,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        aiCoachMessage: {
          fontSize: 12,
          color: isDark ? '#CBD5E1' : '#64748B',
          marginTop: 2,
          lineHeight: 16,
        },

        // Settings / Target Collapsible Section
        settingsHeaderToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          marginTop: 6,
        },
        settingsBox: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          gap: 12,
        },
        targetInputWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          gap: 8,
        },
        targetInput: {
          flex: 1,
          fontSize: 14,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        themeRow: {
          flexDirection: 'row',
          gap: 6,
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
          padding: 4,
          borderRadius: 14,
        },
        themePill: {
          flex: 1,
          paddingVertical: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
        },
        themePillActive: {
          backgroundColor: '#3B82F6',
        },
        themePillText: {
          fontSize: 11,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        saveBtn: {
          backgroundColor: '#3B82F6',
          borderRadius: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 4,
        },
        saveBtnText: {
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: '800',
        },
        outlineBtn: {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        dangerBtn: {
          backgroundColor: '#FEF2F2',
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#FECACA',
        },

        // Modal Edit Profile
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
          gap: 16,
        },
        modalTitle: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
          textAlign: 'center',
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Profile Card (Clickable to Edit Profile & Avatar) */}
        <Pressable
          style={styles.topProfileCard}
          onPress={() => {
            setEditingName(userName);
            setShowEditModal(true);
          }}
        >
          <View style={styles.avatarRainbowRing}>
            <View style={styles.avatarInnerCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} />
              ) : selectedEmoji ? (
                <Ionicons name={selectedEmoji as any} size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
              ) : (
                <Text style={styles.avatarLetter}>{userInitial}</Text>
              )}
            </View>
          </View>
          <View style={styles.profileInfoCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.profileNameText}>{userName}</Text>
              <Ionicons name="pencil-outline" size={14} color="#3B82F6" />
            </View>
            <Text style={styles.profileEmailText}>{user?.email || 'user@lifesync.app'}</Text>
            <View style={styles.memberBadge}>
              <Ionicons name="sparkles" size={10} color="#DB2777" />
              <Text style={styles.memberBadgeText}>LifeSync AI Member</Text>
            </View>
          </View>
        </Pressable>

        {/* Greeting Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.greetingTitle}>
            {greeting}, {userName}!
          </Text>
          <Ionicons name={icon} size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </View>

        {/* Card 1: Today's Progress */}
        <View style={styles.progressCard}>
          <Text style={styles.progressCardTitle}>Today's Progress</Text>

          <View style={styles.vitalsGrid}>
            {/* Calories Ring */}
            <View style={styles.vitalCol}>
              <Text style={styles.vitalColTitle}>Calories</Text>
              <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={80} height={80} viewBox="0 0 80 80">
                  <G rotation="-90" origin="40, 40">
                    <Circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke={isDark ? '#334155' : '#DCE8F2'}
                      strokeWidth="9"
                      fill="none"
                    />
                    <Circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="#EA580C"
                      strokeWidth="9"
                      strokeDasharray="201"
                      strokeDashoffset={201 * (1 - calProgress)}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </G>
                </Svg>
                <Text style={{ position: 'absolute', fontSize: 16, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  {currentCalories}
                </Text>
              </View>
              <Text style={styles.vitalColVal}>{currentCalories} / {targetCals} kcal</Text>
            </View>

            {/* Water Intake Thermometer */}
            <View style={styles.vitalCol}>
              <Text style={styles.vitalColTitle}>Water Intake</Text>
              <View style={styles.thermoTrack}>
                <View style={[styles.thermoFillTeal, { height: `${Math.max(20, waterProgress * 100)}%` }]}>
                  <Ionicons name="water" size={13} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.vitalColVal}>{currentWater} / {targetWater} ml</Text>
            </View>

            {/* Steps Thermometer */}
            <View style={styles.vitalCol}>
              <Text style={styles.vitalColTitle}>Steps</Text>
              <View style={styles.thermoTrack}>
                <View style={[styles.thermoFillPink, { height: `${Math.max(20, stepProgress * 100)}%` }]}>
                  <Ionicons name="footsteps" size={13} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.vitalColVal}>{stepsCount.toLocaleString()} / {targetSteps} steps</Text>
            </View>
          </View>
        </View>

        {/* Card 2: Daily Routine */}
        <Text style={styles.routineSectionHeader}>Daily Routine</Text>
        <View style={styles.routineGrid}>
          {/* Card 1: Meditation */}
          <LinearGradient
            colors={['#E9D5FF', '#C084FC']}
            style={styles.routineCard}
          >
            <Ionicons name="flower-outline" size={26} color="#581C87" />
            <Text style={styles.routineCardText}>Daily Meditation</Text>
            <Text style={styles.routineCardSub}>(10 min)</Text>
          </LinearGradient>

          {/* Card 2: Workout */}
          <LinearGradient
            colors={['#FECACA', '#F87171']}
            style={styles.routineCard}
          >
            <Ionicons name="barbell-outline" size={26} color="#7F1D1D" />
            <Text style={styles.routineCardText}>Workout Session</Text>
            <Text style={styles.routineCardSub}>(45 min)</Text>
          </LinearGradient>

          {/* Card 3: Reading */}
          <LinearGradient
            colors={['#FEF08A', '#FBBF24']}
            style={styles.routineCard}
          >
            <Ionicons name="book-outline" size={26} color="#78350F" />
            <Text style={styles.routineCardText}>Evening Reading</Text>
            <Text style={styles.routineCardSub}>(15 pages)</Text>
          </LinearGradient>
        </View>

        {/* Card 3: AI Coach Insight */}
        <View style={styles.aiCoachCard}>
          <View style={styles.aiRobotBox}>
            <Ionicons name="hardware-chip" size={22} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiCoachTitle}>AI Coach Insight</Text>
            <Text style={styles.aiCoachMessage}>
              Try a 10-minute walk after lunch to boost your daily step goal.
            </Text>
          </View>
        </View>

        {/* Settings & Goals Configuration Panel */}
        <Pressable
          style={styles.settingsHeaderToggle}
          onPress={() => setShowSettingsDrawer(!showSettingsDrawer)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="settings-outline" size={18} color="#3B82F6" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Account Settings & Preferences
            </Text>
          </View>
          <Ionicons
            name={showSettingsDrawer ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#64748B"
          />
        </Pressable>

        {showSettingsDrawer && (
          <View style={styles.settingsBox}>
            {/* Theme Switcher */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Theme Mode
            </Text>
            <View style={styles.themeRow}>
              <Pressable
                style={[styles.themePill, scheme === 'light' && styles.themePillActive]}
                onPress={() => setScheme('light')}
              >
                <Text style={[styles.themePillText, scheme === 'light' && { color: '#FFFFFF' }]}>Light</Text>
              </Pressable>
              <Pressable
                style={[styles.themePill, scheme === 'dark' && styles.themePillActive]}
                onPress={() => setScheme('dark')}
              >
                <Text style={[styles.themePillText, scheme === 'dark' && { color: '#FFFFFF' }]}>Dark</Text>
              </Pressable>
              <Pressable
                style={[styles.themePill, scheme === 'system' && styles.themePillActive]}
                onPress={() => setScheme('system')}
              >
                <Text style={[styles.themePillText, scheme === 'system' && { color: '#FFFFFF' }]}>System</Text>
              </Pressable>
            </View>

            {/* Calorie Goal */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Daily Calorie Target (kcal)
            </Text>
            <View style={styles.targetInputWrapper}>
              <TextInput
                style={styles.targetInput}
                keyboardType="numeric"
                value={calorieTarget}
                onChangeText={setCalorieTarget}
              />
            </View>

            {/* Water Goal */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Daily Water Goal (ml)
            </Text>
            <View style={styles.targetInputWrapper}>
              <TextInput
                style={styles.targetInput}
                keyboardType="numeric"
                value={waterTargetMl}
                onChangeText={setWaterTargetMl}
              />
            </View>

            {/* Step Goal */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Daily Step Goal
            </Text>
            <View style={styles.targetInputWrapper}>
              <TextInput
                style={styles.targetInput}
                keyboardType="numeric"
                value={stepTarget}
                onChangeText={setStepTarget}
              />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSaveGoals}>
              {goalsSaved ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
              <Text style={styles.saveBtnText}>{goalsSaved ? 'Targets Saved!' : 'Save Targets'}</Text>
            </Pressable>

            {/* Notifications toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Push Notifications
              </Text>
              <Switch value={notificationsEnabled} onValueChange={handleToggleNotifications} />
            </View>

            {/* Data Export & Logout */}
            <Pressable style={styles.outlineBtn} onPress={handleExport}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>Export My Data</Text>
            </Pressable>

            <Pressable style={styles.outlineBtn} onPress={handleExportPdf} disabled={exportingPdf}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>
                {exportingPdf ? 'Generating PDF…' : 'Export as PDF Report'}
              </Text>
            </Pressable>

            <Pressable style={styles.dangerBtn} onPress={handleDelete}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Delete Account</Text>
            </Pressable>

            <Pressable style={styles.outlineBtn} onPress={logOut}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>Sign Out</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Edit Profile & Avatar Bottom Sheet Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowEditModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Profile & Avatar</Text>

            {/* Avatar Photo Picker */}
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Pressable style={styles.avatarRainbowRing} onPress={handlePickImage}>
                <View style={styles.avatarInnerCircle}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} />
                  ) : selectedEmoji ? (
                    <Ionicons name={selectedEmoji as any} size={26} color={isDark ? '#F8FAFC' : '#0F172A'} />
                  ) : (
                    <Text style={styles.avatarLetter}>{userInitial}</Text>
                  )}
                </View>
              </Pressable>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={handlePickImage}
              >
                <Ionicons name="camera-outline" size={16} color="#3B82F6" />
                <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '700' }}>
                  Upload Avatar Photo
                </Text>
              </Pressable>
            </View>

            {/* Avatar Preset Emojis */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', textAlign: 'center' }}>
              Or Pick an Avatar Badge
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {AVATAR_PRESETS.map((em, idx) => (
                <Pressable
                  key={idx}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: selectedEmoji === em ? '#E0E7FF' : isDark ? '#0F172A' : '#F1F5F9',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selectedEmoji === em ? 2 : 1,
                    borderColor: selectedEmoji === em ? '#4F46E5' : isDark ? '#334155' : '#E2E8F0',
                  }}
                  onPress={() => handleSelectEmoji(em)}
                >
                  <Ionicons
                    name={em}
                    size={20}
                    color={selectedEmoji === em ? '#4F46E5' : isDark ? '#F8FAFC' : '#0F172A'}
                  />
                </Pressable>
              ))}
            </View>

            {/* Display Name Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Your Display Name
              </Text>
              <View style={styles.targetInputWrapper}>
                <TextInput
                  style={styles.targetInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  placeholder="Enter your name"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Save Profile Button */}
            <Pressable
              style={styles.saveBtn}
              onPress={handleSaveProfileDetails}
              disabled={savingProfile || profileSaved}
            >
              {!savingProfile ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
              <Text style={styles.saveBtnText}>
                {profileSaved ? 'Saved!' : savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
