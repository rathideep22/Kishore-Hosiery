import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator,
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

export default function OrdersScreen() {
  const { user, wsMessage } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      let path = '/orders?';
      if (filter) path += `status=${filter}&`;
      if (search) path += `search=${encodeURIComponent(search)}&`;
      const data = await api.get(path);
      setOrders(data);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => { fetchOrders(); }, [filter]);
  useEffect(() => {
    if (wsMessage?.type?.startsWith('ORDER_')) fetchOrders();
  }, [wsMessage]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const handleSearch = () => { setLoading(true); fetchOrders(); };

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
          <Text style={styles.metaText}>Slip</Text>
        </View>
      </View>
      <View style={[styles.statusBar, { backgroundColor: getStatusColor(item) + '18' }]}>
        <Text style={[styles.statusBarText, { color: getStatusColor(item) }]}>
          {item.dispatched ? 'Dispatched' : item.readinessStatus}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Orders</Text>
        {user?.role === 'admin' && (
          <TouchableOpacity
            testID="add-order-btn"
            style={styles.addBtn}
            onPress={() => router.push('/order/create')}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={Colors.textInverse} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          testID="order-search-input"
          style={styles.searchInput}
          placeholder="Search by party or order ID..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => { setSearch(''); setLoading(true); setTimeout(fetchOrders, 100); }}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            testID={`filter-${f.key || 'all'}`}
            style={[styles.filterChip, filter === f.key && styles.filterActive]}
            onPress={() => { setFilter(f.key); setLoading(true); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  addBtn: { backgroundColor: Colors.brand, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, backgroundColor: Colors.bgSecondary, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.text, marginLeft: Spacing.sm },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  filterActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  filterText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: Colors.textInverse },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand, letterSpacing: 0.5 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  partyName: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginTop: 4 },
  cardMeta: { flexDirection: 'row', marginTop: Spacing.md, gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  statusBar: { marginTop: Spacing.md, borderRadius: 6, paddingVertical: 4, paddingHorizontal: Spacing.sm, alignSelf: 'flex-start' },
  statusBarText: { fontSize: FontSize.xs, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.sm },
});
