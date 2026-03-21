import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

export default function CreateOrderScreen() {
  const router = useRouter();
  const [partyName, setPartyName] = useState('');
  const [message, setMessage] = useState('');
  const [totalParcels, setTotalParcels] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!partyName.trim()) { Alert.alert('Error', 'Party name is required'); return; }
    if (!message.trim()) { Alert.alert('Error', 'Order message is required'); return; }
    if (!totalParcels || parseInt(totalParcels) <= 0) { Alert.alert('Error', 'Enter valid number of parcels'); return; }

    setLoading(true);
    try {
      await api.post('/orders', {
        partyName: partyName.trim(),
        message: message.trim(),
        totalParcels: parseInt(totalParcels),
      });
      Alert.alert('Success', 'Order created successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Create Order</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>PARTY NAME</Text>
          <TextInput
            testID="party-name-input"
            style={styles.input}
            placeholder="e.g. ABC Traders"
            placeholderTextColor={Colors.textSecondary}
            value={partyName}
            onChangeText={setPartyName}
          />

          <Text style={styles.label}>ORDER MESSAGE</Text>
          <TextInput
            testID="order-message-input"
            style={[styles.input, styles.messageInput]}
            placeholder="WhatsApp-style order details..."
            placeholderTextColor={Colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>TOTAL PARCELS</Text>
          <TextInput
            testID="total-parcels-input"
            style={styles.input}
            placeholder="e.g. 30"
            placeholderTextColor={Colors.textSecondary}
            value={totalParcels}
            onChangeText={setTotalParcels}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            testID="submit-order-btn"
            style={[styles.submitBtn, loading && styles.btnDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color={Colors.textInverse} />
                <Text style={styles.submitText}>Create Order</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  scroll: { flex: 1, padding: Spacing.xl },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 52, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  messageInput: { height: 140, paddingTop: Spacing.md },
  submitBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xxl, gap: Spacing.sm },
  btnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: '700' },
});
