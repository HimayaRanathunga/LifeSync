import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToUserProfile, updateBodyMeasurements } from '../../services/profileService';
import { BMI_FOOD_GUIDANCE, categorizeBmi, computeBmi } from '../../constants/bmiFoodGuidance';
import type { UserProfile } from '../../types';

export default function FoodHealthDetailScreen({ navigation }: any) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingMeasurements, setEditingMeasurements] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserProfile(user.uid, (p) => {
      setProfile(p);
      if (p?.heightCm) setHeightInput(String(p.heightCm));
      if (p?.weightKg) setWeightInput(String(p.weightKg));
    });
  }, [user]);

  const bmi = useMemo(() => {
    if (!profile?.heightCm || !profile?.weightKg) return null;
    return computeBmi(profile.heightCm, profile.weightKg);
  }, [profile]);

  const guidance = bmi !== null ? BMI_FOOD_GUIDANCE[categorizeBmi(bmi)] : null;

  const handleSaveMeasurements = async () => {
    if (!user) return;
    const heightCm = parseFloat(heightInput);
    const weightKg = parseFloat(weightInput);
    if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return;
    setSaving(true);
    try {
      await updateBodyMeasurements(user.uid, heightCm, weightKg);
      setEditingMeasurements(false);
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: isDark ? '#0B0D17' : '#FFFFFF' },
        container: {
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
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
          fontSize: 18,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        card: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 22,
          padding: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          marginBottom: 16,
          gap: 12,
        },
        cardTitle: {
          fontSize: 15,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        bodyText: {
          fontSize: 13,
          color: isDark ? '#CBD5E1' : '#475569',
          lineHeight: 19,
        },
        bmiValue: {
          fontSize: 34,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        bmiCategory: {
          fontSize: 13,
          fontWeight: '800',
          color: '#2563EB',
        },
        inputRow: {
          flexDirection: 'row',
          gap: 10,
        },
        inputWrapper: {
          flex: 1,
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        inputLabel: {
          fontSize: 11,
          fontWeight: '700',
          color: isDark ? '#94A3B8' : '#64748B',
          marginBottom: 4,
        },
        input: {
          fontSize: 15,
          fontWeight: '700',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        saveBtn: {
          backgroundColor: '#0F172A',
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
        },
        saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
        listRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
        },
        listText: {
          flex: 1,
          fontSize: 13,
          color: isDark ? '#CBD5E1' : '#334155',
          lineHeight: 19,
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <Text style={styles.screenTitle}>Health Benefits & BMI Guidance</Text>
        </View>

        {!profile?.heightCm || !profile?.weightKg || editingMeasurements ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enter your height & weight</Text>
            <Text style={styles.bodyText}>
              We use this to calculate your BMI and suggest foods that suit you best.
            </Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  value={heightInput}
                  onChangeText={setHeightInput}
                  keyboardType="numeric"
                  placeholder="170"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="numeric"
                  placeholder="65"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
            <Pressable style={styles.saveBtn} onPress={handleSaveMeasurements} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Calculate My BMI'}</Text>
            </Pressable>
            {profile?.heightCm && profile?.weightKg ? (
              <Pressable onPress={() => setEditingMeasurements(false)}>
                <Text style={[styles.bodyText, { textAlign: 'center' }]}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your BMI</Text>
            <Text style={styles.bmiValue}>{bmi?.toFixed(1)}</Text>
            <Text style={styles.bmiCategory}>{guidance?.label}</Text>
            <Text style={styles.bodyText}>{guidance?.summary}</Text>
            <Pressable
              onPress={() => {
                setHeightInput(String(profile.heightCm));
                setWeightInput(String(profile.weightKg));
                setEditingMeasurements(true);
              }}
            >
              <Text style={[styles.bodyText, { color: '#2563EB', fontWeight: '700' }]}>Update measurements</Text>
            </Pressable>
          </View>
        )}

        {guidance ? (
          <>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.cardTitle}>Foods that suit you</Text>
              </View>
              {guidance.recommended.map((item) => (
                <View key={item} style={styles.listRow}>
                  <Ionicons name="leaf-outline" size={14} color="#10B981" style={{ marginTop: 3 }} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="close-circle" size={18} color="#EF4444" />
                <Text style={styles.cardTitle}>Foods to limit</Text>
              </View>
              {guidance.limit.map((item) => (
                <View key={item} style={styles.listRow}>
                  <Ionicons name="remove-circle-outline" size={14} color="#EF4444" style={{ marginTop: 3 }} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
