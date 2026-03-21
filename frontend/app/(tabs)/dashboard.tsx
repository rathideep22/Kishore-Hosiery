import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Stats {
  totalActive: number;
  ready: number;
  partialReady: number;
  pending: number;
  dispatchedToday: number;
  noInvoice: number;
  noTransport: number;
}

interface Order {
  id: string;
  orderId: string;
  partyName: string;
  totalParcels: number;
  readinessStatus: string;
  dispatched: boolean;
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const statusColor = order.dispatched ? Colors.textSecondary
    : order.readinessStatus === 'Ready' ? Colors.success
    : order.readinessStatus === 'Partial Ready' ? Colors.warning
    : Colors.danger;

  return (
    <TouchableOpacity testID={`order-row-${order.orderId}`} style={styles.orderRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.orderLeft}>
        <Text style={styles.orderId}>{order.orderId}</Text>
        <Text style={styles.partyName}>{order.partyName}</Text>
      </View>
      <View style={styles.orderRight}>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {order.dispatched ? 'Dispatched' : order.readinessStatus}
          </Text>
        </View>
        <Text style={styles.parcelsText}>{order.totalParcels} parcels</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { user, wsMessage } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, ordersData] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/orders'),
      ]);
      setStats(statsData);
      setRecentOrders(ordersData.slice(0, 8));
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (wsMessage?.type === 'ORDER_CREATED' || wsMessage?.type === 'ORDER_UPDATED' || wsMessage?.type === 'ORDER_DELETED') {
      fetchData();
    }
  }, [wsMessage]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        {stats && (
          <View style={styles.statsGrid}>
            <StatCard label="Active Orders" value={stats.totalActive} color={Colors.info} icon="cube" />
            <StatCard label="Ready" value={stats.ready} color={Colors.success} icon="checkmark-circle" />
            <StatCard label="Partial Ready" value={stats.partialReady} color={Colors.warning} icon="time" />
            <StatCard label="Pending" value={stats.pending} color={Colors.danger} icon="alert-circle" />
            <StatCard label="Dispatched Today" value={stats.dispatchedToday} color={Colors.brand} icon="send" />
            <StatCard label="No Invoice" value={stats.noInvoice} color={Colors.warning} icon="document-text" />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          <TouchableOpacity testID="view-all-orders-btn" onPress={() => router.push('/(tabs)/orders')} activeOpacity={0.7}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        ) : (
          recentOrders.map(order => (
            <OrderRow key={order.id} order={order} onPress={() => router.push(`/order/${order.id}`)} />
          ))
        )}

        {user?.role === 'admin' && (
          <TouchableOpacity
            testID="create-order-fab"
            style={styles.fab}
            onPress={() => router.push('/order/create')}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={24} color={Colors.textInverse} />
            <Text style={styles.fabText}>New Order</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, paddingBottom: Spacing.lg },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary },
  userName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  rolePill: { backgroundColor: Colors.brand, borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  roleText: { color: Colors.textInverse, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  statCard: { width: '48%', flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderRadius: 8, padding: Spacing.md },
  statValue: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  viewAll: { fontSize: FontSize.sm, color: Colors.info, fontWeight: '600' },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: Spacing.sm },
  orderLeft: { flex: 1 },
  orderId: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand },
  partyName: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500', marginTop: 2 },
  orderRight: { alignItems: 'flex-end' },
  statusPill: { borderRadius: 12, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  parcelsText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.sm },
  fab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brand, borderRadius: 12, marginHorizontal: Spacing.xl, marginTop: Spacing.lg, height: 52, gap: Spacing.sm },
  fabText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: '700' },
});
