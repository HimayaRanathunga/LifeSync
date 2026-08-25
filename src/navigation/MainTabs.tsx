import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import HabitsListScreen from '../screens/habits/HabitsListScreen';
import AddEditHabitScreen from '../screens/habits/AddEditHabitScreen';
import HabitHistoryScreen from '../screens/habits/HabitHistoryScreen';
import HealthScreen from '../screens/health/HealthScreen';
import FoodScanScreen from '../screens/food/FoodScanScreen';
import FoodHealthDetailScreen from '../screens/food/FoodHealthDetailScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();
const HabitsStack = createNativeStackNavigator();
const FoodStack = createNativeStackNavigator();

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Dashboard: { active: 'home-outline', inactive: 'home-outline' },
  Activity: { active: 'grid-outline', inactive: 'grid-outline' },
  Health: { active: 'stats-chart-outline', inactive: 'stats-chart-outline' },
  Food: { active: 'camera-outline', inactive: 'camera-outline' },
  Settings: { active: 'person-outline', inactive: 'person-outline' },
};

function HabitsStackNavigator() {
  const { colors } = useTheme();
  return (
    <HabitsStack.Navigator
      screenOptions={{
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '800' },
        headerStyle: { backgroundColor: colors.background },
      }}
    >
      <HabitsStack.Screen
        name="HabitsList"
        component={HabitsListScreen}
        options={{ headerShown: false }}
      />
      <HabitsStack.Screen
        name="AddEditHabit"
        component={AddEditHabitScreen}
        options={{ headerShown: false }}
      />
      <HabitsStack.Screen
        name="HabitHistory"
        component={HabitHistoryScreen}
        options={({ route }) => ({ title: (route.params as any)?.habitTitle ?? 'Habit History' })}
      />
    </HabitsStack.Navigator>
  );
}

function FoodStackNavigator() {
  const { colors } = useTheme();
  return (
    <FoodStack.Navigator
      screenOptions={{
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '800' },
        headerStyle: { backgroundColor: colors.background },
      }}
    >
      <FoodStack.Screen name="FoodScan" component={FoodScanScreen} options={{ headerShown: false }} />
      <FoodStack.Screen
        name="FoodHealthDetail"
        component={FoodHealthDetailScreen}
        options={{ headerShown: false }}
      />
    </FoodStack.Navigator>
  );
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: insets.bottom > 0 ? insets.bottom + 4 : 14,
          left: 18,
          right: 18,
          backgroundColor: '#0F141C',
          borderRadius: 40,
          height: 66,
          borderTopWidth: 0,
          borderWidth: 0,
          elevation: 20,
          shadowColor: '#000000',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          paddingHorizontal: 8,
          paddingVertical: 6,
          alignItems: 'center',
          justifyContent: 'space-around',
        },
        tabBarIcon: ({ focused }) => {
          const icons = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
          return (
            <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={22}
                color={focused ? '#0F141C' : '#FFFFFF'}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {/*
        Tabs that host a stack remember whichever screen they were left on, so after visiting a
        detail screen the tab button stops doing what its icon says — the camera icon would
        reopen the BMI page instead of the scanner. Resetting to the stack's first screen on
        every tab press makes the icon mean the same thing every time.
      */}
      <Tab.Screen
        name="Activity"
        component={HabitsStackNavigator}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Activity', { screen: 'HabitsList' });
          },
        })}
      />
      <Tab.Screen name="Health" component={HealthScreen} />
      <Tab.Screen
        name="Food"
        component={FoodStackNavigator}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Food', { screen: 'FoodScan' });
          },
        })}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
