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

export default function SignupScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLengthValid = password.length >= 6;
  const isMatchValid = password.length > 0 && password === confirmPassword;

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      navigation.replace('Onboarding');
    } catch (err: any) {
      setError(err?.message || 'Account registration failed. Please try again.');
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
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 30,
          justifyContent: 'center',
        },
        headerSection: {
          alignItems: 'center',
          marginBottom: 28,
          gap: 10,
        },
        appBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#DBEAFE',
        },
        appBadgeText: {
          fontSize: 11,
          fontWeight: '800',
          color: '#2563EB',
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
          maxWidth: 300,
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
          gap: 14,
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

        // Validation Pills
        validationRow: {
          flexDirection: 'row',
          gap: 8,
          marginTop: 2,
        },
        valPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
        },
        valPillActive: {
          backgroundColor: '#ECFDF5',
        },
        valPillText: {
          fontSize: 11,
          fontWeight: '700',
          color: '#64748B',
        },
        valPillTextActive: {
          color: '#059669',
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
        signUpBtn: {
          backgroundColor: isDark ? '#38BDF8' : '#0F172A',
          borderRadius: 18,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 8,
          shadowColor: '#000000',
          shadowOpacity: 0.15,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        signUpBtnText: {
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
          marginTop: 20,
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
            <Logo size={50} />
            <View style={styles.appBadge}>
              <Ionicons name="sparkles" size={12} color="#2563EB" />
              <Text style={styles.appBadgeText}>LifeSync Setup</Text>
            </View>
            <Text style={styles.titleText}>Create Account</Text>
            <Text style={styles.subtitleText}>
              Start your personalized circadian health and daily habit journey.
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
                  placeholder="Minimum 6 characters"
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

            {/* Confirm Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#94A3B8"
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Live Password Validation Indicators */}
            <View style={styles.validationRow}>
              <View style={[styles.valPill, isLengthValid && styles.valPillActive]}>
                <Ionicons
                  name={isLengthValid ? 'checkmark' : 'ellipse-outline'}
                  size={12}
                  color={isLengthValid ? '#059669' : '#64748B'}
                />
                <Text style={[styles.valPillText, isLengthValid && styles.valPillTextActive]}>
                  6+ chars
                </Text>
              </View>

              <View style={[styles.valPill, isMatchValid && styles.valPillActive]}>
                <Ionicons
                  name={isMatchValid ? 'checkmark' : 'ellipse-outline'}
                  size={12}
                  color={isMatchValid ? '#059669' : '#64748B'}
                />
                <Text style={[styles.valPillText, isMatchValid && styles.valPillTextActive]}>
                  Matches
                </Text>
              </View>
            </View>

            {/* Sign Up Button */}
            <Pressable
              style={styles.signUpBtn}
              onPress={handleSignup}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#0F172A' : '#FFFFFF'} size="small" />
              ) : (
                <Text style={styles.signUpBtnText}>Create Account →</Text>
              )}
            </Pressable>
          </View>

          {/* Footer Login Link */}
          <View style={styles.footerSection}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Pressable onPress={() => navigation.navigate('Login')} accessibilityRole="button">
              <Text style={styles.footerLink}>Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
