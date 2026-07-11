import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/utils/api';
import { Colors, FontSize, Spacing } from '../src/constants/theme';

interface Godown {
  id: string;
  name: string;
  prefix?: string;
}

export default function GodownsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/gowdowns');
      setGodowns(data);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePrefix = async (g: Godown) => {
    const next = (edits[g.id] ?? g.prefix ?? '').trim().toUpperCase();
    if (!next) { Alert.alert('Error', 'Prefix cannot be empty'); return; }
    if (next === (g.prefix || '').toUpperCase()) return;
    setSavingId(g.id);
    try {
      const updated = await api.put(`/gowdowns/${g.id}/prefix`, { prefix: next });
      setGodowns(prev => prev.map(x => x.id === g.id ? { ...x, prefix: updated.prefix } : x));
      setEdits(prev => { const u = { ...prev }; delete u[g.id]; return u; });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update prefix');
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Godowns</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Admin access required</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Godowns</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.intro}>
        Each godown has its own order-number prefix. New orders created for a godown are numbered with that prefix, e.g.{' '}
        <Text style={styles.bold}>SU-0001</Text>, <Text style={styles.bold}>LS-0001</Text>.
      </Text>
      <FlatList
        data={godowns}
        keyExtractor={g => g.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.brand} />}
        contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }}
        renderItem={({ item }) => {
          const current = edits[item.id] ?? item.prefix ?? '';
          const dirty = current.trim().toUpperCase() !== (item.prefix || '').toUpperCase();
          return (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Ionicons name={item.name === 'Sundha' ? 'home' : 'storefront'} size={20} color={Colors.brand} />
                <Text style={styles.cardName}>{item.name}</Text>
              </View>
              <Text style={styles.label}>ORDER PREFIX</Text>
              <View style={styles.prefixRow}>
                <TextInput
                  style={styles.input}
                  value={current}
                  onChangeText={val => setEdits(prev => ({ ...prev, [item.id]: val.toUpperCase() }))}
                  placeholder="e.g. SU"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="characters"
                  maxLength={5}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, (!dirty || savingId === item.id) && styles.saveBtnDisabled]}
                  disabled={!dirty || savingId === item.id}
                  onPress={() => savePrefix(item)}
                  activeOpacity={0.85}
                >
                  {savingId === item.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  intro: { padding: Spacing.xl, color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  bold: { fontWeight: '800', color: Colors.text },
  muted: { color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardName: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginTop: Spacing.sm },
  prefixRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    height: 48,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.bg,
    letterSpacing: 2,
  },
  saveBtn: {
    backgroundColor: Colors.brand,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '800' },
});
