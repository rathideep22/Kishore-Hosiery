import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/utils/api';
import { Colors, FontSize, Spacing } from '../src/constants/theme';

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
  godown: string;
  items?: OrderItem[];
  godownDistribution: { godown: string; readyParcels: number }[];
  createdAt: string;
}

export default function DispatchScreen() {
  const routeParams = useLocalSearchParams<{ godown?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  // Get godown from route params
  const godown = routeParams.godown || 'All';

  useEffect(() => {
    fetchNonDispatchedOrders();
  }, []);

  const fetchNonDispatchedOrders = async () => {
    try {
      setLoading(true);
      let data;

      if (godown === 'All') {
        // Fetch from both godowns
        const [lal, sundha] = await Promise.all([
          api.get('/orders?godown=Lal-Shivnagar'),
          api.get('/orders?godown=Sundha'),
        ]);
        data = [...(lal || []), ...(sundha || [])];
      } else {
        data = await api.get(`/orders?godown=${godown}`);
      }

      // Filter only non-dispatched orders
      const nonDispatched = (data || []).filter((order: any) => !order.dispatched);
      setOrders(nonDispatched);
    } catch (error) {
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleDispatchSelected = async () => {
    if (selectedOrders.size === 0) {
      Alert.alert('Info', 'Please select orders to dispatch');
      return;
    }

    try {
      setDispatching(true);
      // Dispatch each selected order
      const dispatchPromises = Array.from(selectedOrders).map(orderId =>
        api.put(`/orders/${orderId}/dispatch`)
      );
      await Promise.all(dispatchPromises);

      // Auto-redirect back to godown after successful dispatch
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to dispatch orders');
    } finally {
      setDispatching(false);
    }
  };

  const getStatusColor = (order: Order) => {
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

  const renderOrder = ({ item }: { item: Order }) => {
    const isSelected = selectedOrders.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.orderRow, isSelected && styles.orderRowSelected]}
        onPress={() => toggleOrderSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.checkbox}>
          {isSelected && (
            <Ionicons name="checkmark" size={18} color={Colors.brand} />
          )}
        </View>
        <View style={styles.orderInfo}>
          <Text style={styles.partyName}>{item.partyName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="cube-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{getReadySummary(item)} parcels</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(item) }]}>
                {item.readinessStatus}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
      <View style={styles.headerTop}>
        <TouchableOpacity
          style={styles.backButtonTop}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.brand} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{godown}</Text>
          <Text style={styles.subtitle}>Dispatch Orders</Text>
        </View>
        <View style={styles.selectionCount}>
          <Text style={styles.selectionText}>{selectedOrders.size}</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-outline" size={48} color={Colors.success} />
          <Text style={styles.emptyText}>No orders to dispatch</Text>
          <TouchableOpacity
            style={styles.backButtonEmpty}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonEmptyText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={orders}
            renderItem={renderOrder}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            style={{ flex: 1 }}
          />

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.brand} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dispatchBtn, selectedOrders.size === 0 && styles.dispatchBtnDisabled]}
              onPress={handleDispatchSelected}
              disabled={dispatching || selectedOrders.size === 0}
              activeOpacity={0.7}
            >
              {dispatching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.dispatchBtnText}>Dispatch</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  backButtonTop: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1 },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  selectionCount: { backgroundColor: Colors.brand, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  selectionText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
  listContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  orderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border, borderRadius: 12, padding: Spacing.md, gap: Spacing.md },
  orderRowSelected: { borderColor: Colors.brand, backgroundColor: Colors.brand + '08' },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: Colors.border, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  orderInfo: { flex: 1 },
  partyName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.md, color: Colors.success, marginTop: Spacing.lg, fontWeight: '600' },
  backButtonEmpty: { marginTop: Spacing.xl, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.brand, borderRadius: 8 },
  backButtonEmptyText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.md },
  backBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, borderRadius: 8, gap: Spacing.xs },
  backBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.brand },
  dispatchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brand, paddingVertical: Spacing.md, borderRadius: 8, gap: Spacing.xs, shadowColor: Colors.brand, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  dispatchBtnDisabled: { backgroundColor: Colors.border, shadowOpacity: 0 },
  dispatchBtnText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
});
