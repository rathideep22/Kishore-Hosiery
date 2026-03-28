import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'partial', label: 'Partial' },
  { key: 'ready', label: 'Ready' },
  { key: 'dispatched', label: 'Dispatched' },
];

interface Order {
  id: string;
  orderId: string;
  partyName: string;
  totalParcels: number;
  readinessStatus: string;
  dispatched: boolean;
  invoiceGiven: boolean;
  transportSlip: boolean;
  godownDistribution: { godown: string; readyParcels: number }[];
  createdAt: string;
}

export default function SundhaScreen() {
  const { user, wsMessage } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      let path = '/orders?godown=Sundha';
      if (filter) path += `&status=${filter}`;
      const data = await api.get(path);
      setOrders(data);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { fetchOrders(); }, [filter]);
  useEffect(() => {
    if (wsMessage?.type?.startsWith('ORDER_')) fetchOrders();
  }, [wsMessage]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const getStatusColor = (order: Order) => {
    if (order.dispatched) return Colors.textSecondary;
    if (order.readinessStatus === 'Ready') return Colors.success;
    if (order.readinessStatus === 'Partial Ready') return Colors.warning;
    return Colors.danger;
  };

  const getReadySummary = (order: Order) => {
    const total = order.godownDistribution?.reduce((s, g) => s + g.readyParcels, 0) || 0;
    return `${total}/${order.totalParcels}`;
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity
      testID={`order-card-${item.orderId}`}
      style={styles.card}
      onPress={() => router.push(`/order/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={styles.orderId}>{item.orderId}</Text>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item) }]} />
      </View>
      <Text style={styles.partyName}>{item.partyName}</Text>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{getReadySummary(item)} parcels</Text>
        </View>
        <View style={styles.metaItem}>
          {item.invoiceGiven ? (
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          ) : (
            <Ionicons name="close-circle" size={14} color={Colors.danger} />
          )}
          <Text style={styles.metaText}>Invoice</Text>
        </View>
        <View style={styles.metaItem}>
          {item.transportSlip ? (
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          ) : (
            <Ionicons name="close-circle" size={14} color={Colors.danger} />
          )}
          <Text style={styles.metaText}>Transport</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && orders.length === 0) {
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
        <View>
          <Text style={styles.title}>Sundha</Text>
          <Text style={styles.subtitle}>Gowdown Orders</Text>
        </View>
        <Ionicons name="warehouse" size={32} color={Colors.brand} />
      </View>

      <View style={styles.filterScroll}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="inbox-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>No orders for Sundha gowdown</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  filterScroll: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  filterBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: 20, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  filterText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.textInverse },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.lg, marginBottom: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  orderId: { fontSize: FontSize.md, fontWeight: '700', color: Colors.brand },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  partyName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  cardMeta: { flexDirection: 'row', gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.md },
});
