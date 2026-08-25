import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/Logo';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigation.replace('MainTabs');
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: isDark ? '#0B0D17' : '#F8FAFC',
        },
        keyboardView: {
          flex: 1,
        },
        container: {
          flexGrow: 1,
          paddingHorizontal: 22,
          paddingTop: insets.top + 30,
          paddingBottom: insets.bottom + 30,
          justifyContent: 'center',
        },
        headerSection: {
          alignItems: 'center',
          marginBottom: 32,
          gap: 12,
        },
        titleText: {
          fontSize: 28,
          fontWeight: '900',
          color: isDark ? '#F8FAFC' : '#0F172A',
          letterSpacing: -0.6,
          textAlign: 'center',
        },
        subtitleText: {
          fontSize: 14,
          color: isDark ? '#94A3B8' : '#64748B',
          textAlign: 'center',
          maxWidth: 290,
          lineHeight: 20,
        },

        // Form Card
        formCard: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: 28,
          padding: 24,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          shadowColor: '#000000',
          shadowOpacity: 0.04,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
          gap: 16,
        },
        fieldGroup: {
          gap: 6,
        },
        fieldLabel: {
          fontSize: 13,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0F172A',
        },
        inputContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          paddingHorizontal: 14,
          paddingVertical: 12,
          gap: 10,
        },
        input: {
          flex: 1,
          fontSize: 15,
          color: isDark ? '#F8FAFC' : '#0F172A',
          fontWeight: '600',
        },

        errorBox: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#FEF2F2',
          borderWidth: 1,
          borderColor: '#FECACA',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        errorText: {
          color: '#DC2626',
          fontSize: 13,
          fontWeight: '700',
          flex: 1,
        },

        // Action Button
        signInBtn: {
          backgroundColor: isDark ? '#38BDF8' : '#0F172A',
          borderRadius: 18,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 6,
          shadowColor: '#000000',
          shadowOpacity: 0.15,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        signInBtnText: {
          color: isDark ? '#0F172A' : '#FFFFFF',
          fontSize: 16,
          fontWeight: '900',
        },

        // Footer Switch
        footerSection: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          marginTop: 24,
        },
        footerText: {
          fontSize: 14,
          color: isDark ? '#94A3B8' : '#64748B',
        },
        footerLink: {
          fontSize: 14,
          fontWeight: '900',
          color: '#2563EB',
        },
      }),
    [isDark, insets]
  );

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header & Logo */}
          <View style={styles.headerSection}>
            <Logo size={54} />
            <Text style={styles.titleText}>Welcome Back</Text>
            <Text style={styles.subtitleText}>
              Sign in to synchronize your nutrition, daily habits, and circadian health.
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={isDark ? '#94A3B8' : '#64748B'}
                  />
                </Pressable>
              </View>
            </View>

            {/* Sign In Button */}
            <Pressable
              style={styles.signInBtn}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#0F172A' : '#FFFFFF'} size="small" />
              ) : (
                <Text style={styles.signInBtnText}>Sign In →</Text>
              )}
            </Pressable>
          </View>

          {/* Footer Register Link */}
          <View style={styles.footerSection}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Pressable onPress={() => navigation.navigate('Signup')} accessibilityRole="button">
              <Text style={styles.footerLink}>Create Account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
