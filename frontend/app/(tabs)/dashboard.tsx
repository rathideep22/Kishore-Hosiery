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
import { useResponsive, getGridColumns, getResponsiveSpacing, getResponsiveFontSize, getTruncationLines, getInputDimensions } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Stats {
  totalActive: number;
  ready?: number;
  partialReady?: number;
  pending?: number;
  dispatched?: number;
  billGenerated?: number;
  completed?: number;
  needsBill?: number;
}

interface Order {
  id: string;
  orderId: string;
  partyName: string;
  location: string;
  totalParcels: number;
  readinessStatus: string;
  dispatched: boolean;
  godown: string;
  createdAt: string;
}

function StatCard({ label, value, color, icon, width, onPress }: { label: string; value: number; color: string; icon: string; width: number; onPress?: () => void }) {
  const columns = width < 390 ? 2 : width < 600 ? 3 : 5;
  const cardWidth = (width - 32) / columns - 5;

  const content = (
    <>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  const cardStyle = [styles.statCard, { borderLeftColor: color, width: cardWidth }];

  if (!onPress) return <View style={cardStyle}>{content}</View>;
  return (
    <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const statusColor = order.readinessStatus === 'Completed' ? Colors.success
    : order.readinessStatus === 'Bill Generated' ? '#8B5CF6'
      : order.dispatched ? Colors.textSecondary
        : order.readinessStatus === 'Ready' ? Colors.info
          : order.readinessStatus === 'Partial Ready' ? Colors.warning
            : Colors.danger;

  return (
    <TouchableOpacity testID={`order-row-${order.orderId}`} style={styles.orderRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.orderLeft}>
        <Text style={styles.orderId}>{order.orderId}</Text>
        <Text style={styles.partyName}>{order.partyName}</Text>
        {order.location && <Text style={styles.locationText}>{order.location}</Text>}
      </View>
      <View style={styles.orderRight}>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {order.readinessStatus === 'Completed' ? 'Completed' : order.readinessStatus === 'Bill Generated' ? 'Bill Generated' : order.dispatched ? 'Dispatched' : order.readinessStatus}
          </Text>
        </View>
        <Text style={styles.parcelsText}>{order.totalParcels} parcels</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { user, wsMessage, logout } = useAuth();
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

      // Merge all orders from both godowns
      const allOrders = [...(sundhOrdersData || []), ...(lalShivOrdersData || [])];

      const role = user?.role;
      const recentOrders = allOrders
        .filter((order: Order) => {
          if (role === 'admin') return true;
          if (role === 'accountant') return order.readinessStatus === 'Ready' || order.readinessStatus === 'Partial Ready' || order.dispatched;
          return !order.dispatched; // Staff sees only non-dispatched
        })
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
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                logout();
                router.replace('/');
              }}
              activeOpacity={0.7}
              style={styles.logoutBtn}
            >
              <Ionicons name="log-out" size={22} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {stats && user?.role === 'admin' && (
          <View style={styles.statsGrid}>
            <StatCard label="Active" value={stats.totalActive} color={Colors.info} icon="cube" width={width} onPress={() => router.push('/all-orders?status=')} />
            <StatCard label="Pending" value={stats.pending || 0} color={Colors.danger} icon="alert-circle" width={width} onPress={() => router.push('/all-orders?status=pending')} />
            <StatCard label="Partial" value={stats.partialReady || 0} color={Colors.warning} icon="time" width={width} onPress={() => router.push('/all-orders?status=partial')} />
            <StatCard label="Ready" value={stats.ready || 0} color={Colors.info} icon="checkmark-circle" width={width} onPress={() => router.push('/all-orders?status=ready')} />
            <StatCard label="Dispatched" value={stats.dispatched || 0} color={Colors.textSecondary} icon="send" width={width} onPress={() => router.push('/all-orders?status=dispatched')} />
            <StatCard label="Bill Gen" value={stats.billGenerated || 0} color="#8B5CF6" icon="document-text" width={width} onPress={() => router.push('/all-orders?status=bill_generated')} />
            <StatCard label="Completed" value={stats.completed || 0} color={Colors.success} icon="checkmark-done-circle" width={width} onPress={() => router.push('/all-orders?status=completed')} />
            <TouchableOpacity
              style={[styles.allOrdersCard, { width: (width - 32) / (width < 390 ? 2 : width < 600 ? 3 : 5) - 5 }]}
              onPress={() => router.push('/all-orders')}
              activeOpacity={0.7}
            >
              <Ionicons name="list" size={18} color={Colors.brand} />
              <Text style={styles.allOrdersLabel}>All</Text>
              <Text style={styles.allOrdersLabel}>Orders</Text>
            </TouchableOpacity>
          </View>
        )}

        {stats && user?.role === 'accountant' && (
          <View style={styles.statsGrid}>
            <StatCard label="Needs Bill" value={stats.needsBill || 0} color={Colors.danger} icon="alert-circle" width={width} onPress={() => router.push('/all-orders?status=dispatched')} />
            <StatCard label="Bill Gen" value={stats.billGenerated || 0} color="#8B5CF6" icon="document-text" width={width} onPress={() => router.push('/all-orders?status=bill_generated')} />
          </View>
        )}

        {stats && user?.role === 'staff' && (
          <View style={styles.statsGrid}>
            <StatCard label="Active" value={stats.totalActive} color={Colors.info} icon="cube" width={width} onPress={() => router.push('/all-orders?status=')} />
            <StatCard label="Pending" value={stats.pending || 0} color={Colors.danger} icon="alert-circle" width={width} onPress={() => router.push('/all-orders?status=pending')} />
            <StatCard label="Partial" value={stats.partialReady || 0} color={Colors.warning} icon="time" width={width} onPress={() => router.push('/all-orders?status=partial')} />
            <StatCard label="Ready" value={stats.ready || 0} color={Colors.info} icon="checkmark-circle" width={width} onPress={() => router.push('/all-orders?status=ready')} />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>No active orders</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, paddingBottom: Spacing.sm, minHeight: 70 },
  greeting: { fontSize: FontSize.xs, color: Colors.textSecondary },
  userName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1, justifyContent: 'flex-end' },
  rolePill: { backgroundColor: Colors.brand, borderRadius: 20, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  roleText: { color: Colors.textInverse, fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  logoutBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  statsGrid: { paddingHorizontal: Spacing.md, marginBottom: 8, marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  statCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderRadius: 8, padding: 10, minHeight: 85, marginBottom: 0, justifyContent: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.text, marginTop: 4 },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 12 },
  allOrdersCard: { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.brand, borderRadius: 8, padding: 10, minHeight: 85, marginBottom: 0, justifyContent: 'center', alignItems: 'center' },
  allOrdersLabel: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '700', marginTop: 0, lineHeight: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 6 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: Spacing.sm, minHeight: 80, flexWrap: 'wrap' },
  orderLeft: { flex: 1, minWidth: '60%' },
  orderId: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand },
  partyName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', marginTop: 2 },
  locationText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  orderRight: { alignItems: 'flex-end', marginLeft: Spacing.sm },
  statusPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, minHeight: 22 },
  statusText: { fontSize: 9, fontWeight: '700' },
  parcelsText: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  floatingBtn: { position: 'absolute', bottom: Spacing.xl + 0, right: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brand, justifyContent: 'center', alignItems: 'center', minHeight: 48, minWidth: 48, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
});
