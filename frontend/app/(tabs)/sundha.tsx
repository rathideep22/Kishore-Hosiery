import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView, TextInput, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { SearchInput } from '../../src/components/SearchInput';
import { FilterDropdown } from '../../src/components/FilterDropdown';
import { useResponsive } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'partial', label: 'Partial' },
  { key: 'ready', label: 'Ready' },
  { key: 'dispatched', label: 'Dispatched' },
];

interface OrderItem {
  productId: string;
  quantity: number;
  fulfillment?: (number | null)[];
}

interface Order {
  id: string;
  orderId: string;
  partyName: string;
  totalParcels: number;
  readinessStatus: string;
  dispatched: boolean;
  invoiceGiven: boolean;
  transportSlip: boolean;
  items?: OrderItem[];
  godownDistribution: { godown: string; readyParcels: number }[];
  createdAt: string;
}

export default function SundhaScreen() {
  const { user, wsMessage } = useAuth();
  const router = useRouter();
  const { width } = useResponsive();
  const theme = getResponsiveTheme(width);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const path = '/orders?godown=Sundha';
      const data = await api.get(path);
      setAllOrders(data);
      filterOrders(data, filter, search);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filterOrders = (allData: Order[], statusFilter: string, searchQuery: string) => {
    let filtered = allData;

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(order => {
        if (statusFilter === 'pending') return order.readinessStatus === 'Pending';
        if (statusFilter === 'partial') return order.readinessStatus === 'Partial Ready';
        if (statusFilter === 'ready') return order.readinessStatus === 'Ready';
        if (statusFilter === 'dispatched') return order.dispatched;
        return true;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.orderId.toLowerCase().includes(q) ||
        order.partyName.toLowerCase().includes(q)
      );
    }

    setOrders(filtered);
  };

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    filterOrders(allOrders, filter, search);
  }, [filter, search]);

  useEffect(() => {
    if (wsMessage?.type?.startsWith('ORDER_')) fetchOrders();
  }, [wsMessage]);

  // Refresh orders when screen comes into focus (returning from order detail)
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const getStatusColor = (order: Order) => {
    if (order.dispatched) return Colors.textSecondary;
    if (order.readinessStatus === 'Ready') return Colors.success;
    if (order.readinessStatus === 'Partial Ready') return Colors.warning;
    return Colors.danger;
  };

  const getReadySummary = (order: Order) => {
    // Calculate from items' fulfillment data
    const fulfilled = (order.items || []).reduce((sum, item) => {
      const itemFulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
      return sum + itemFulfilled;
    }, 0);
    return `${fulfilled}/${order.totalParcels}`;
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity
      testID={`order-card-${item.orderId}`}
      style={[styles.card, width < 430 && { marginHorizontal: Spacing.sm }]}
      onPress={() => router.push(`/order/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={styles.partyName}>{item.partyName}</Text>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item) }]} />
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{getReadySummary(item)} parcels</Text>
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
        <TouchableOpacity
          style={styles.dispatchBtn}
          onPress={() => router.push('/dispatch?godown=Sundha')}
          activeOpacity={0.7}
        >
          <Ionicons name="send" size={18} color="#fff" />
          <Text style={styles.dispatchText}>Dispatch</Text>
        </TouchableOpacity>
      </View>

      <SearchInput
        placeholder="Search order ID or party..."
        value={search}
        onChangeText={setSearch}
      />

      <FilterDropdown
        options={FILTERS}
        selectedKey={filter}
        onSelect={setFilter}
        placeholder="Filter by Status"
      />

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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  dispatchBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 8, gap: Spacing.xs },
  dispatchText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.lg, marginBottom: Spacing.sm, minHeight: 100 },
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
