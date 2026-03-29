import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/utils/api';
import { Colors, FontSize, Spacing } from '../src/constants/theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const otpRef = useRef<TextInput>(null);

  const sendOTP = async () => {
    const fullPhone = `+91${phone.replace(/\D/g, '')}`;
    if (phone.replace(/\D/g, '').length !== 10) {
      Alert.alert('Error', 'Enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone: fullPhone });
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length !== 4) {
      Alert.alert('Error', 'Enter the 4-digit OTP');
      return;
    }
    const fullPhone = `+91${phone.replace(/\D/g, '')}`;
    setLoading(true);
    try {
      const data = await api.post('/auth/verify-otp', { phone: fullPhone, otp });
      await login(data.token, data.user);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Image source={require('../assets/images/logo.png')} style={styles.logo} />
          <Text style={styles.title}>Kishor Hosiery</Text>
          <Text style={styles.subtitle}>Order Management System</Text>

          {step === 'phone' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+91</Text>
                </View>
                <TextInput
                  testID="phone-input"
                  style={styles.phoneInput}
                  placeholder="Enter 10-digit number"
                  placeholderTextColor={Colors.textSecondary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>
              <Text style={styles.hint}>Enter your 10-digit phone number</Text>
              <TouchableOpacity
                testID="send-otp-btn"
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={sendOTP}
                disabled={loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.btnText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Enter OTP</Text>
              <Text style={styles.otpHint}>OTP sent to +91{phone} (Use 1234)</Text>
              <TextInput
                ref={otpRef}
                testID="otp-input"
                style={styles.otpInput}
                placeholder="1234"
                placeholderTextColor={Colors.textSecondary}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={4}
              />
              <TouchableOpacity
                testID="verify-otp-btn"
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={verifyOTP}
                disabled={loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.btnText}>Verify & Login</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="change-phone-btn"
                onPress={() => { setStep('phone'); setOtp(''); }}
                style={styles.linkBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>Change Phone Number</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.footer}>Mock OTP: 1234</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  logo: { width: 120, height: 120, resizeMode: 'contain', marginBottom: Spacing.lg },
  title: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.xxl },
  form: { width: '100%', maxWidth: 400 },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  phoneRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  prefix: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, borderRightWidth: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, justifyContent: 'center', paddingHorizontal: Spacing.lg, height: 52 },
  prefixText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: Spacing.lg, fontSize: FontSize.lg, color: Colors.text, height: 52, backgroundColor: Colors.bg },
  hint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.xl },
  otpHint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  otpInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, fontSize: FontSize.xxl, color: Colors.text, height: 60, textAlign: 'center', letterSpacing: 12, marginBottom: Spacing.xl, backgroundColor: Colors.bg },
  btn: { backgroundColor: Colors.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: '700' },
  linkBtn: { marginTop: Spacing.lg, alignItems: 'center', padding: Spacing.md },
  linkText: { color: Colors.textSecondary, fontSize: FontSize.md, textDecorationLine: 'underline' },
  footer: { marginTop: Spacing.xxl, fontSize: FontSize.xs, color: Colors.textSecondary },
});
