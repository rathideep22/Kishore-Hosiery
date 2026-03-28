import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/utils/api';
import { SearchInput } from '../src/components/SearchInput';
import { FilterDropdown } from '../src/components/FilterDropdown';
import { DateRangePicker } from '../src/components/DateRangePicker';
import { useResponsive } from '../src/utils/responsive';
import { getResponsiveTheme } from '../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../src/constants/theme';

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'partial', label: 'Partial' },
  { key: 'ready', label: 'Ready' },
  { key: 'dispatched', label: 'Dispatched' },
];

const GODOWN_FILTERS = [
  { key: '', label: 'All Godowns' },
  { key: 'Sundha', label: 'Sundha' },
  { key: 'Lal-Shivnagar', label: 'Lal-Shivnagar' },
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
  godown: string;
  items?: OrderItem[];
  godownDistribution: { godown: string; readyParcels: number }[];
  createdAt: string;
}

export default function AllOrdersScreen() {
  const { user, wsMessage } = useAuth();
  const router = useRouter();
  const { width } = useResponsive();
  const theme = getResponsiveTheme(width);
  const isSmallPhone = width < 430;

  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const [sundhData, lalShivData] = await Promise.all([
        api.get('/orders?godown=Sundha'),
        api.get('/orders?godown=Lal-Shivnagar'),
      ]);
      const allData = [...(sundhData || []), ...(lalShivData || [])];
      setAllOrders(allData);
      applyFilters(allData, statusFilter, godownFilter, startDate, endDate, search);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const applyFilters = (allData: Order[], status: string, godown: string, start: string | null, end: string | null, searchQuery: string) => {
    let filtered = allData;

    // Godown filter
    if (godown) {
      filtered = filtered.filter(order => order.godown === godown);
    }

    // Status filter
    if (status) {
      filtered = filtered.filter(order => {
        if (status === 'pending') return order.readinessStatus === 'Pending';
        if (status === 'partial') return order.readinessStatus === 'Partial Ready';
        if (status === 'ready') return order.readinessStatus === 'Ready';
        if (status === 'dispatched') return order.dispatched;
        return true;
      });
    }

    // Date range filter
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(ord => {
        const orderDate = new Date(ord.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
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

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setOrders(filtered);
  };

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    applyFilters(allOrders, statusFilter, godownFilter, startDate, endDate, search);
  }, [statusFilter, godownFilter, startDate, endDate, search]);

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
      testID={`all-order-card-${item.orderId}`}
      style={[styles.card, isSmallPhone && { marginHorizontal: Spacing.sm }]}
      onPress={() => router.push(`/order/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={styles.partyName}>{item.partyName}</Text>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item) }]} />
      </View>
      <View style={[styles.cardMeta, isSmallPhone && { gap: Spacing.sm }]}>
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
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={isSmallPhone ? 20 : 24} color={Colors.brand} />
          <Text style={[styles.backText, isSmallPhone && { fontSize: FontSize.xs }]}>
            {isSmallPhone ? 'Back' : 'Back to Dashboard'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dispatchHeaderBtn}
          onPress={() => router.push('/dispatch?godown=All')}
          activeOpacity={0.7}
        >
          <Ionicons name="send" size={18} color="#fff" />
          <Text style={styles.dispatchHeaderText}>Dispatch</Text>
        </TouchableOpacity>
      </View>

      <SearchInput
        placeholder="Search order ID or party..."
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersList}
      >
        <FilterDropdown
          options={GODOWN_FILTERS}
          selectedKey={godownFilter}
          onSelect={setGodownFilter}
          placeholder="Godown"
        />
        <FilterDropdown
          options={STATUS_FILTERS}
          selectedKey={statusFilter}
          onSelect={setStatusFilter}
          placeholder="Status"
        />
      </ScrollView>

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
        placeholder="Select Date Range"
      />

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="inbox-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>No orders found</Text>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 8 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand },
  dispatchHeaderBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 8, gap: Spacing.xs },
  dispatchHeaderText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  filtersScroll: { maxHeight: 60 },
  filtersList: { paddingHorizontal: Spacing.lg, gap: 6, paddingVertical: 6 },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.lg, marginBottom: Spacing.sm, minHeight: 100 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  cardTopLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orderId: { fontSize: FontSize.md, fontWeight: '700', color: Colors.brand },
  godownBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  godownText: { fontSize: 9, fontWeight: '700' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  partyName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  cardMeta: { flexDirection: 'row', gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.md },
});
