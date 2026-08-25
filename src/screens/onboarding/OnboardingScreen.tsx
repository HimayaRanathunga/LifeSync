import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/Logo';
import type { UserProfile, DailyGoals, Goal } from '../../types';
import GoalPicker from '../../components/GoalPicker';

function format12h(timeStr: string): string {
  const [hStr, mStr] = (timeStr || '07:00').split(':');
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
  const [hStr, mStr] = (timeStr || '07:00').split(':');
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

export default function OnboardingScreen({ navigation }: any) {
  const { user, logOut } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Wizard Step: 1 = Routine, 2 = Targets, 3 = Summary
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Routine State
  const [wakeTime, setWakeTime] = useState('07:00');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');

  // Step 2: Targets State
  const [calories, setCalories] = useState(2000);
  const [water, setWater] = useState(2500);
  const [steps, setSteps] = useState(8000);
  // Population medians, used only as a sane starting position for the steppers — the value
  // actually saved is whatever the user leaves them on.
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(70);
  // Previously hardcoded to ['fitness','study'] for every user, which made the field useless for
  // personalisation. GoalPicker already existed in src/components but was wired to nothing.
  const [selectedGoals, setSelectedGoals] = useState<Goal[]>(['fitness']);

  const [saving, setSaving] = useState(false);

  const handleComplete = async () => {
    if (saving) return;
    setSaving(true);

    try {
      if (user) {
        const dailyGoals: DailyGoals = {
          calorieTarget: calories,
          waterTargetMl: water,
          stepTarget: steps,
        };

        const profile: UserProfile = {
          uid: user.uid,
          displayName: user.email?.split('@')[0] ?? 'User',
          email: user.email ?? '',
          wakeTime,
          workStart,
          workEnd,
          goals: selectedGoals,
          dailyGoals,
          heightCm,
          weightKg,
          createdAt: Date.now(),
        };

        // Awaited, not fire-and-forget: this is the only write that creates the user's profile,
        // and every screen afterwards reads from it. A silent failure here left the account with
        // no profile document at all, with nothing shown to the user to explain why.
        await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
      }

      navigation.replace('MainTabs');
    } catch (err: any) {
      console.warn('[onboarding] profile save failed:', err?.code, err?.message);
      Alert.alert(
        'Could not save your profile',
        err?.code === 'permission-denied'
          ? 'The database rejected the write. Firestore security rules may not be deployed yet.'
          : 'Check your connection and try again.',
        [
          { text: 'Retry', onPress: () => setSaving(false) },
          {
            text: 'Continue anyway',
            style: 'cancel',
            onPress: () => navigation.replace('MainTabs'),
          },
        ]
      );
      return;
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: isDark ? '#0B0D17' : '#F1F5F9',
        },
        topNavRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: insets.top + 10,
          paddingBottom: 10,
        },
        topHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          marginBottom: 16,
          marginTop: 4,
        },
        screenTitle: {
          fontSize: 22,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.4,
        },
        headerSubtitle: {
          fontSize: 13,
          color: isDark ? '#94A3B8' : '#64748B',
          paddingHorizontal: 20,
          marginTop: -10,
          marginBottom: 16,
          lineHeight: 18,
        },
        container: {
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 30,
          gap: 16,
        },

        // White Card Box
        card: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
          gap: 12,
        },
        cardTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        cardTitle: {
          fontSize: 16,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        cardSubtitle: {
          fontSize: 12,
          color: isDark ? '#94A3B8' : '#64748B',
          marginTop: -6,
        },

        // Stepper Component
        stepperWrapper: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
          borderRadius: 18,
          paddingHorizontal: 8,
          paddingVertical: 8,
        },
        stepBtn: {
          width: 44,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
        stepperValue: {
          fontSize: 18,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.3,
        },

        // Routine Time Pills
        pillsRow: {
          flexDirection: 'row',
          gap: 8,
          marginTop: 2,
        },
        timePill: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 10,
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        timePillActive: {
          backgroundColor: '#3A92A6',
          borderColor: '#3A92A6',
        },
        timePillText: {
          fontSize: 11,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
        },
        timePillTextActive: {
          color: '#FFFFFF',
        },

        // Step 3: Summary Card Elements
        summaryDonutRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 20,
          marginTop: 6,
        },
        summaryValuesCol: {
          gap: 6,
          flex: 1,
        },
        summaryValText: {
          fontSize: 15,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        progressBarGroup: {
          gap: 10,
          marginTop: 14,
        },
        progressRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        progressLabel: {
          fontSize: 13,
          fontWeight: '700',
          color: isDark ? '#CBD5E1' : '#475569',
        },
        progressTrack: {
          width: 140,
          height: 8,
          borderRadius: 4,
          backgroundColor: isDark ? '#334155' : '#E2E8F0',
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          borderRadius: 4,
          backgroundColor: '#3A92A6',
        },

        // Bottom Action Button
        actionBtn: {
          backgroundColor: '#3A92A6',
          borderRadius: 20,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 10,
          shadowColor: '#3A92A6',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        actionBtnText: {
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: '800',
        },
        backLink: {
          alignItems: 'center',
          paddingVertical: 8,
        },
        backLinkText: {
          color: '#64748B',
          fontSize: 13,
          fontWeight: '700',
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      {/* Top Navigation Row */}
      <View style={styles.topNavRow}>
        {step > 1 ? (
          <Pressable onPress={() => setStep((s) => (s - 1) as any)}>
            <Ionicons name="chevron-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
        ) : (
          <Pressable onPress={logOut}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700' }}>Sign Out</Text>
          </Pressable>
        )}
        <Logo size={36} />
      </View>

      {/* Screen Title according to Step */}
      <View style={styles.topHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {step !== 1 ? (
            <Ionicons name="trophy" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          ) : null}
          <Text style={styles.screenTitle}>
            {step === 1 && 'Tell Us About Your Routine'}
            {step === 2 && 'Daily Targets & Goals'}
            {step === 3 && 'Setup Summary'}
          </Text>
        </View>
      </View>

      {step === 3 && (
        <Text style={styles.headerSubtitle}>
          Personalize your nutrition, hydration, and movement targets.
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ================= STEP 1: ROUTINE ================= */}
        {step === 1 && (
          <>
            {/* Wake Up Time Card */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="sunny-outline" size={18} color="#EA580C" />
                <Text style={styles.cardTitle}>Wake Up Time</Text>
              </View>
              <Text style={styles.cardSubtitle}>Your typical morning wake up time</Text>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setWakeTime(adjustMinutes(wakeTime, -30))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{format12h(wakeTime)}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setWakeTime(adjustMinutes(wakeTime, 30))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>

              <View style={styles.pillsRow}>
                {['06:00', '06:30', '07:00'].map((t) => {
                  const isActive = wakeTime === t;
                  return (
                    <Pressable
                      key={t}
                      style={[styles.timePill, isActive && styles.timePillActive]}
                      onPress={() => setWakeTime(t)}
                    >
                      <Text style={[styles.timePillText, isActive && styles.timePillTextActive]}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Work / Focus Shift Card */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="home-outline" size={18} color="#059669" />
                <Text style={styles.cardTitle}>Work / Focus Shift</Text>
              </View>
              <Text style={styles.cardSubtitle}>Work Day (simplified)</Text>

              {/* Start Shift Stepper */}
              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setWorkStart(adjustMinutes(workStart, -30))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{format12h(workStart)}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setWorkStart(adjustMinutes(workStart, 30))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>

              {/* End Shift Stepper */}
              <View style={[styles.stepperWrapper, { marginTop: 6 }]}>
                <Pressable style={styles.stepBtn} onPress={() => setWorkEnd(adjustMinutes(workEnd, -30))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{format12h(workEnd)}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setWorkEnd(adjustMinutes(workEnd, 30))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            <Pressable style={styles.actionBtn} onPress={() => setStep(2)}>
              <Text style={styles.actionBtnText}>Next: Daily Targets →</Text>
            </Pressable>
          </>
        )}

        {/* ================= STEP 2: TARGETS ================= */}
        {step === 2 && (
          <>
            {/* Calorie Budget */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="flame-outline" size={18} color="#EA580C" />
                <Text style={styles.cardTitle}>Calorie Budget (kcal)</Text>
              </View>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setCalories((c) => Math.max(1200, c - 100))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{calories}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setCalories((c) => Math.min(4500, c + 100))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            {/* Water Intake Goal */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="water-outline" size={18} color="#0284C7" />
                <Text style={styles.cardTitle}>Water Intake Goal (ml)</Text>
              </View>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setWater((w) => Math.max(1000, w - 250))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{water}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setWater((w) => Math.min(6000, w + 250))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            {/* Daily Step Goal */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="footsteps-outline" size={18} color="#7C3AED" />
                <Text style={styles.cardTitle}>Daily Step Goal (steps)</Text>
              </View>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setSteps((s) => Math.max(3000, s - 500))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{steps}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setSteps((s) => Math.min(30000, s + 500))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            {/* Height and weight are asked once here rather than on the buried food-detail
                screen, because the Dashboard needs them for its distance and active-burn
                estimates and the Health screen needs them for BMI. Both are optional — every
                consumer already renders "—" when they are absent. */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="body-outline" size={18} color="#0EA5E9" />
                <Text style={styles.cardTitle}>Height (cm)</Text>
              </View>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setHeightCm((h) => Math.max(120, h - 1))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{heightCm}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setHeightCm((h) => Math.min(220, h + 1))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="fitness-outline" size={18} color="#F59E0B" />
                <Text style={styles.cardTitle}>Weight (kg)</Text>
              </View>

              <View style={styles.stepperWrapper}>
                <Pressable style={styles.stepBtn} onPress={() => setWeightKg((w) => Math.max(30, w - 1))}>
                  <Ionicons name="remove" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
                <Text style={styles.stepperValue}>{weightKg}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setWeightKg((w) => Math.min(250, w + 1))}>
                  <Ionicons name="add" size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <GoalPicker value={selectedGoals} onChange={setSelectedGoals} />
            </View>

            <Pressable style={styles.actionBtn} onPress={() => setStep(3)}>
              <Text style={styles.actionBtnText}>Next: Summary →</Text>
            </Pressable>

            <Pressable style={styles.backLink} onPress={() => setStep(1)}>
              <Text style={styles.backLinkText}>← Back to Routine</Text>
            </Pressable>
          </>
        )}

        {/* ================= STEP 3: SUMMARY ================= */}
        {step === 3 && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Target Macros (kcal, ml, steps)</Text>

              {/* Donut Chart and Metric Numbers */}
              <View style={styles.summaryDonutRow}>
                <Svg width={96} height={96} viewBox="0 0 100 100">
                  <G rotation="-90" origin="50, 50">
                    <Circle
                      cx="50"
                      cy="50"
                      r="36"
                      stroke={isDark ? '#334155' : '#E2E8F0'}
                      strokeWidth="14"
                      fill="none"
                    />
                    <Circle
                      cx="50"
                      cy="50"
                      r="36"
                      stroke="#3A92A6"
                      strokeWidth="14"
                      strokeDasharray="226"
                      strokeDashoffset={226 * (1 - 0.72)}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </G>
                </Svg>

                <View style={styles.summaryValuesCol}>
                  <Text style={styles.summaryValText}>Cal: {calories}</Text>
                  <Text style={styles.summaryValText}>Water: {water} ml</Text>
                  <Text style={styles.summaryValText}>Steps: {steps}</Text>
                </View>
              </View>

              {/* Metric Progress Bars */}
              <View style={styles.progressBarGroup}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Cal: {calories}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '65%' }]} />
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Water: {water} ml</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '80%' }]} />
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Steps: {steps}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '75%' }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* Complete Setup Button */}
            <Pressable
              style={styles.actionBtn}
              onPress={handleComplete}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.actionBtnText}>Complete Setup & Open LifeSync</Text>
              )}
            </Pressable>

            <Pressable style={styles.backLink} onPress={() => setStep(2)}>
              <Text style={styles.backLinkText}>← Back to Targets</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
