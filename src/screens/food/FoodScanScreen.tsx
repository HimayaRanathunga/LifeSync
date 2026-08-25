import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { prepareImageForUpload } from '../../services/imageUtils';
import { analyzeFoodPhoto, saveFoodLog, subscribeToFoodLogs } from '../../services/foodService';
import type { FoodAnalysis, FoodLog } from '../../types';
import { toDateKey } from '../../utils/dates';

const MEAL_TYPES = [
  { id: 'm1', label: 'Breakfast', icon: 'cafe-outline', tag: 'Morning Fuel' },
  { id: 'm2', label: 'Lunch', icon: 'restaurant-outline', tag: 'Main Energy' },
  { id: 'm3', label: 'Dinner', icon: 'fish-outline', tag: 'Light Recovery' },
  { id: 'm4', label: 'Morning Snack', icon: 'nutrition-outline', tag: 'Little Meal 1' },
  { id: 'm5', label: 'Evening Snack', icon: 'leaf-outline', tag: 'Little Meal 2' },
];

/**
 * Picks the meal slot that matches the current local hour, so opening the scanner at 23:00 does
 * not default to "Breakfast". The user can still override it from the dropdown — this only sets
 * the starting value.
 */
function mealTypeForHour(hour: number): string {
  if (hour < 5) return 'Evening Snack'; // late night still belongs to the previous evening
  if (hour < 10) return 'Breakfast';
  if (hour < 12) return 'Morning Snack';
  if (hour < 15) return 'Lunch';
  if (hour < 18) return 'Evening Snack';
  if (hour < 22) return 'Dinner';
  return 'Evening Snack';
}


// Shown before any photo has been scanned this session — a genuine empty state, not a fake
// canned example, so the screen doesn't look like it already has (stale) results on open.
const EMPTY_MEAL: FoodAnalysis = {
  isFood: true,
  mealTitle: 'No meal scanned yet',
  foodItems: [],
  totalCalories: 0,
  macros: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  condition: '',
  healthTip: 'Take a photo or pick one from your gallery to analyze a meal.',
  confidence: 0,
};

export default function FoodScanScreen() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // Meal Type Dropdown State — seeded from the clock rather than always starting at Breakfast.
  // Lazy initialiser so the hour is read once on mount, not on every render.
  const [selectedMealType, setSelectedMealType] = useState(() =>
    mealTypeForHour(new Date().getHours())
  );
  const [showMealTypeDropdown, setShowMealTypeDropdown] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccessBanner, setSavedSuccessBanner] = useState<string | null>(null);
  const [allRecentLogs, setAllRecentLogs] = useState<FoodLog[]>([]);
  const [optimisticLog, setOptimisticLog] = useState<FoodLog | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToFoodLogs(user.uid, setAllRecentLogs);
  }, [user]);

  // Once the real Firestore-backed entry lands (via the live subscription above), drop the
  // optimistic placeholder so the list doesn't show the same item twice.
  useEffect(() => {
    if (!optimisticLog) return;
    const arrived = allRecentLogs.some((log) => log.createdAt >= optimisticLog.createdAt);
    if (arrived) setOptimisticLog(null);
  }, [allRecentLogs, optimisticLog]);

  const recentLogsToShow = useMemo(
    () => (optimisticLog ? [optimisticLog, ...allRecentLogs] : allRecentLogs).slice(0, 5),
    [allRecentLogs, optimisticLog]
  );

  const handlePickImage = async (source: 'camera' | 'library') => {
    try {
      setLoading(true);
      let result;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Camera permission is needed to take food photos.');
          setLoading(false);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Gallery permission is needed to select food photos.');
          setLoading(false);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      const processed = await prepareImageForUpload(asset.uri);
      const foodData = await analyzeFoodPhoto(processed.base64, processed.mimeType, asset.uri);
      setAnalysis(foodData);
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message || 'Could not analyze food image.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !analysis || analysis.isFood === false) return;
    setSaving(true);
    const mealName = analysis.mealTitle || 'Scanned Meal';
    setOptimisticLog({
      ...analysis,
      id: 'optimistic',
      date: toDateKey(),
      createdAt: Date.now(),
      imageUri: photoUri || analysis.imageUri,
    });
    try {
      await saveFoodLog(user.uid, analysis, photoUri || undefined);
      setSavedSuccessBanner(`${selectedMealType}: ${mealName} saved to food log!`);
      setTimeout(() => setSavedSuccessBanner(null), 4000);
      // Clear the scan/analysis area so the screen is ready for the next meal.
      setPhotoUri(null);
      setAnalysis(null);
    } catch (err: any) {
      setOptimisticLog(null);
      Alert.alert('Save Failed', err?.message || 'Could not save to food log.');
    } finally {
      setSaving(false);
    }
  };

  const currentMeal = analysis || EMPTY_MEAL;
  const hasScannedMeal = analysis !== null;

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
          paddingBottom: insets.bottom + 110,
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
        headerDropdownBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        screenTitle: {
          fontSize: 16,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.3,
        },
        headerAddBtn: {
          backgroundColor: isDark ? '#38BDF8' : '#2B4C59',
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 14,
        },
        headerAddBtnText: {
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: '800',
        },

        // Center-Aligned Meal Summary Box
        mealHeaderBox: {
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
          gap: 4,
          paddingHorizontal: 10,
        },
        mealHeaderTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        mealHeaderTitle: {
          fontSize: 17,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          textAlign: 'center',
          lineHeight: 22,
        },
        mealHeaderCals: {
          fontSize: 13,
          fontWeight: '700',
          color: '#64748B',
          textAlign: 'center',
        },
        calibrationCaption: {
          fontSize: 11,
          fontWeight: '600',
          color: '#94A3B8',
          textAlign: 'center',
          marginTop: 2,
        },

        // Hero Image Circular Plate - Perfect Center Alignment
        heroImageContainer: {
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: 12,
        },
        plateCircle: {
          width: 216,
          height: 216,
          borderRadius: 108,
          overflow: 'hidden',
          backgroundColor: '#F1F5F9',
          borderWidth: 4,
          borderColor: isDark ? '#1E293B' : '#FFFFFF',
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        },
        plateImage: {
          width: '100%',
          height: '100%',
        },
        badgeFloat: {
          position: 'absolute',
          top: 10,
          right: 30,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#DCFCE7',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#86EFAC',
        },
        badgeFloatText: {
          fontSize: 11,
          fontWeight: '800',
          color: '#15803D',
        },

        // Scan Action Buttons Row
        scanButtonsRow: {
          flexDirection: 'row',
          gap: 10,
          marginTop: 10,
          marginBottom: 18,
        },
        scanBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
          paddingVertical: 13,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        scanBtnText: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },

        // Category Strip Section
        sectionHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        sectionTitle: {
          fontSize: 15,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        seeAllBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
        },
        seeAllText: {
          fontSize: 12,
          fontWeight: '800',
          color: '#2563EB',
        },

        // AI Suggest Card Box
        aiSuggestCard: {
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          gap: 10,
        },
        aiHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        aiIconCircle: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: '#0F172A',
          alignItems: 'center',
          justifyContent: 'center',
        },
        aiTitleText: {
          fontSize: 14,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        aiBodyText: {
          fontSize: 12,
          color: isDark ? '#CBD5E1' : '#64748B',
          lineHeight: 18,
        },

        // Modals Styles
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
        dropdownItem: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        dropdownItemActive: {
          borderColor: '#2563EB',
          backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF',
        },
        // Recently Added section
        recentSection: {
          marginTop: 20,
        },
        recentItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
          borderRadius: 16,
          padding: 12,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
        recentIconCircle: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: '#2B4C59',
          alignItems: 'center',
          justifyContent: 'center',
        },
        recentItemTitle: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        recentItemMeta: {
          fontSize: 11,
          fontWeight: '600',
          color: '#64748B',
          marginTop: 2,
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Bar with Meal Type Dropdown */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>

          {/* Interactive Dropdown Selector Header */}
          <Pressable
            style={styles.headerDropdownBtn}
            onPress={() => setShowMealTypeDropdown(true)}
          >
            <Text style={styles.screenTitle}>Add {selectedMealType}</Text>
            <Ionicons name="chevron-down" size={15} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>

          <Pressable style={styles.headerAddBtn} onPress={handleSave} disabled={saving || !hasScannedMeal}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.headerAddBtnText}>Add</Text>
            )}
          </Pressable>
        </View>

        {/* Success Banner */}
        {savedSuccessBanner ? (
          <View style={{ backgroundColor: '#ECFDF5', padding: 12, borderRadius: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color="#059669" />
            <Text style={{ color: '#059669', fontSize: 13, fontWeight: '800', textAlign: 'center' }}>
              {savedSuccessBanner}
            </Text>
          </View>
        ) : null}

        
        {/* Center-Aligned Meal Summary Header Box */}
        <View style={styles.mealHeaderBox}>
          <View style={styles.mealHeaderTitleRow}>
            <Text style={styles.mealHeaderTitle} numberOfLines={2}>
              {currentMeal.mealTitle}
            </Text>
          </View>
          <Text style={styles.mealHeaderCals}>
            {hasScannedMeal
              ? `Calorie: ${currentMeal.totalCalories} kcal · Protein: ${currentMeal.macros.proteinGrams}g · Carbs: ${currentMeal.macros.carbsGrams}g`
              : 'Scan a meal below to see nutrition details'}
          </Text>
          {currentMeal.calibrationNote ? (
            <Text style={styles.calibrationCaption}>{currentMeal.calibrationNote}</Text>
          ) : null}
        </View>

        {/* Center-Aligned Circular Food Plate with Floating Fresh Badge */}
        <View style={styles.heroImageContainer}>
          <View style={styles.plateCircle}>
            {loading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#2B4C59" size="large" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 8 }}>
                  Analyzing Image...
                </Text>
              </View>
            ) : photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.plateImage} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="camera-outline" size={40} color="#94A3B8" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#94A3B8' }}>No photo yet</Text>
              </View>
            )}
          </View>

          {/* Floating Fresh Badge — only once a meal has actually been analyzed */}
          {hasScannedMeal ? (
            <View style={styles.badgeFloat}>
              <Ionicons name="leaf" size={12} color="#15803D" />
              <Text style={styles.badgeFloatText}>Fresh & Balanced</Text>
            </View>
          ) : null}
        </View>

        {/* Scan Actions: Camera / Gallery */}
        <View style={styles.scanButtonsRow}>
          <Pressable style={styles.scanBtn} onPress={() => handlePickImage('camera')}>
            <Ionicons name="camera-outline" size={18} color={isDark ? '#F8FAFC' : '#0F172A'} />
            <Text style={styles.scanBtnText}>Take Photo</Text>
          </Pressable>

          <Pressable style={styles.scanBtn} onPress={() => handlePickImage('library')}>
            <Ionicons name="images-outline" size={18} color={isDark ? '#F8FAFC' : '#0F172A'} />
            <Text style={styles.scanBtnText}>Pick Gallery</Text>
          </Pressable>
        </View>

        {/* The "Morning Delight" heading and its category chips were removed: the chips were a
            static decorative list with no data behind them, and the heading claimed a meal slot
            regardless of the time of day. The link is kept because FoodHealthDetail is where
            height and weight are entered, and the Dashboard only offers a route to it while those
            values are still missing — dropping this would strand the screen once they are set. */}
        <Pressable
          style={styles.sectionHeaderRow}
          onPress={() => navigation.navigate('FoodHealthDetail')}
          accessibilityRole="button"
        >
          <Text style={styles.sectionTitle}>Health Benefits & BMI</Text>
          <View style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>Open</Text>
            <Ionicons name="arrow-forward" size={12} color="#2563EB" />
          </View>
        </Pressable>

        {/* AI Suggest / Health Tip Card */}
        <View style={styles.aiSuggestCard}>
          <View style={styles.aiHeaderRow}>
            <View style={styles.aiIconCircle}>
              <Ionicons name="sparkles" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.aiTitleText}>AI suggest</Text>
          </View>
          <Text style={styles.aiBodyText}>
            {currentMeal.healthTip ||
              'Add fruits and vegetables to your breakfast to complete daily circadian nutrition.'}
          </Text>
        </View>

        {/* Recently Added — updates immediately after tapping Add, no navigation needed */}
        {recentLogsToShow.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {recentLogsToShow.map((log) => (
                <View key={log.id} style={styles.recentItem}>
                  <View style={styles.recentIconCircle}>
                    <Ionicons name="restaurant" size={14} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentItemTitle} numberOfLines={1}>
                      {log.mealTitle || 'Scanned Meal'}
                    </Text>
                    <Text style={styles.recentItemMeta}>
                      {log.totalCalories} kcal ·{' '}
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {log.id === 'optimistic' ? ' · saving…' : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Meal Type Dropdown Modal */}
      <Modal
        visible={showMealTypeDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMealTypeDropdown(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMealTypeDropdown(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Select Meal Category</Text>
            <View style={{ gap: 8 }}>
              {MEAL_TYPES.map((m) => {
                const isActive = selectedMealType === m.label;
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedMealType(m.label);
                      setShowMealTypeDropdown(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons
                        name={m.icon as any}
                        size={18}
                        color={isActive ? '#2563EB' : isDark ? '#F8FAFC' : '#0F172A'}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '800',
                          color: isActive ? '#2563EB' : isDark ? '#F8FAFC' : '#0F172A',
                        }}
                      >
                        {m.label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                      {m.tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
