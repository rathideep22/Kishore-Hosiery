import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { useResponsive, getGridColumns } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
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
  godown: string;
  createdAt: string;
}

function StatCard({ label, value, color, icon, width }: { label: string; value: number; color: string; icon: string; width: number }) {
  const columns = width < 390 ? 2 : width < 600 ? 3 : 5;
  const cardWidth = (width - 32) / columns - 5;

  return (
    <View style={[
      styles.statCard,
      { borderLeftColor: color, width: cardWidth },
    ]}>
      <Ionicons name={icon as any} size={24} color={color} />
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
  const { width } = useResponsive();
  const theme = getResponsiveTheme(width);
  const gridColumns = getGridColumns(width);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, sundhOrdersData, lalShivOrdersData] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/orders?godown=Sundha'),
        api.get('/orders?godown=Lal-Shivnagar'),
      ]);
      setStats(statsData);

      // Merge orders and filter for past 48 hours
      const allOrders = [...(sundhOrdersData || []), ...(lalShivOrdersData || [])];
      const now = new Date();
      const past48Hours = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const recentOrders = allOrders
        .filter((order: Order) => new Date(order.createdAt) >= past48Hours)
        .sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      setRecentOrders(recentOrders);
    } catch (e: any) {
      console.error('Error fetching dashboard data:', e);
    } finally {
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

  // Refresh dashboard when screen comes into focus (returning from dispatch/order screens)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
            <StatCard label="Active" value={stats.totalActive} color={Colors.info} icon="cube" width={width} />
            <StatCard label="Ready" value={stats.ready} color={Colors.success} icon="checkmark-circle" width={width} />
            <StatCard label="Partial" value={stats.partialReady} color={Colors.warning} icon="time" width={width} />
            <StatCard label="Pending" value={stats.pending} color={Colors.danger} icon="alert-circle" width={width} />
            <StatCard label="Dispatched" value={stats.dispatchedToday} color={Colors.brand} icon="send" width={width} />
            {user?.role === 'admin' && (
              <TouchableOpacity
                style={[styles.allOrdersCard, { width: (width - 32) / 5 - 5 }]}
                onPress={() => router.push('/all-orders')}
                activeOpacity={0.7}
              >
                <Ionicons name="list" size={18} color={Colors.brand} />
                <Text style={styles.allOrdersLabel}>All</Text>
                <Text style={styles.allOrdersLabel}>Orders</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Orders (Last 48h)</Text>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>No orders in the last 48 hours</Text>
          </View>
        ) : (
          recentOrders.map(order => (
            <OrderRow key={order.id} order={order} onPress={() => router.push(`/order/${order.id}`)} />
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Floating Action Button - Always Visible */}
      {user?.role === 'admin' && (
        <TouchableOpacity
          testID="create-order-fab"
          style={styles.floatingBtn}
          onPress={() => router.push('/order/create')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={Colors.textInverse} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, paddingBottom: Spacing.sm },
  greeting: { fontSize: FontSize.xs, color: Colors.textSecondary },
  userName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 2 },
  rolePill: { backgroundColor: Colors.brand, borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  roleText: { color: Colors.textInverse, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  statsGrid: { paddingHorizontal: Spacing.lg, marginBottom: 8, marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderRadius: 8, padding: 10, minHeight: 85, marginBottom: 8 },
  statValue: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.text, marginTop: 4 },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 12 },
  allOrdersCard: { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.brand, borderRadius: 8, padding: 10, minHeight: 85, marginBottom: 8, justifyContent: 'center', alignItems: 'center' },
  allOrdersLabel: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '700', marginTop: 2, lineHeight: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 6 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Spacing.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: Spacing.sm, minHeight: 80 },
  orderLeft: { flex: 1 },
  orderId: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand },
  partyName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', marginTop: 2 },
  orderRight: { alignItems: 'flex-end' },
  statusPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700' },
  parcelsText: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  floatingBtn: { position: 'absolute', bottom: Spacing.xl + 0, right: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brand, justifyContent: 'center', alignItems: 'center', minHeight: 48, minWidth: 48, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
});
