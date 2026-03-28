import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, useWindowDimensions,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../../../src/constants/theme';

interface OrderItem {
  productId: string;
  alias: string;
  category: string;
  size: string;
  printName: string;
  quantity: number;
  rate?: string;
  fulfillment?: (number | null)[];
}

interface Order {
  id: string;
  items: OrderItem[];
  partyName: string;
  location: string;
  godown: string;
}

export default function CategoryDetailScreen() {
  const { id: orderId, categoryId } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/orders/${orderId}`);
      setOrder(response.data);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      Alert.alert('Error', 'Failed to load order data');
    } finally {
      setLoading(false);
    }
  };

  const getVariantStatus = (item: OrderItem) => {
    const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
    const total = item.quantity;
    const percentage = total > 0 ? (fulfilled / total) * 100 : 0;

    if (percentage === 0) return { color: Colors.danger, label: 'PENDING' };
    if (percentage === 100) return { color: Colors.success, label: 'READY' };
    return { color: Colors.warning, label: 'PARTIAL' };
  };

  const getTotalWeight = (weights: (number | null)[] | undefined) => {
    if (!weights) return 0;
    return weights.reduce((sum, w) => sum + (w || 0), 0);
  };

  const getAverageWeight = (weights: (number | null)[] | undefined, quantity: number) => {
    if (!weights || quantity === 0) return 0;
    const total = getTotalWeight(weights);
    const count = weights.filter(w => w !== null && w !== undefined).length;
    return count > 0 ? (total / count).toFixed(2) : '0.00';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Order not found</Text>
      </SafeAreaView>
    );
  }

  // Filter items by category
  const categoryItems = order.items.filter(item => item.category === categoryId);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.brand} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{categoryId as string}</Text>
          <Text style={styles.headerSubtitle}>{categoryItems.length} variant(s)</Text>
        </View>
      </View>

      {/* Category Info */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Order:</Text>
          <Text style={styles.infoValue}>{orderId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Party:</Text>
          <Text style={styles.infoValue}>{order.partyName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Location:</Text>
          <Text style={styles.infoValue}>{order.location}</Text>
        </View>
      </View>

      {/* Table */}
      <ScrollView
        style={styles.tableContainer}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 100 }]}>Variant</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 60 }]}>Qty</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 60 }]}>Done</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 180 }]}>Weights (kg)</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 70 }]}>Total</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 70 }]}>Avg</Text>
            <Text style={[styles.tableCell, styles.tableHeader, { width: 80 }]}>Status</Text>
          </View>

          {/* Table Body */}
          {categoryItems.map((item) => {
            const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
            const status = getVariantStatus(item);
            const weightsArray = (item.fulfillment || [])
              .map((w, idx) => w ? `${w.toFixed(2)}` : null)
              .filter(w => w !== null);
            const totalWeight = getTotalWeight(item.fulfillment);
            const avgWeight = getAverageWeight(item.fulfillment, item.quantity);

            return (
              <View key={item.productId} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: 100 }]}>
                  <Text style={styles.variantName}>{item.alias}</Text>
                  {'\n'}
                  <Text style={styles.variantSize}>{item.size}</Text>
                </Text>
                <Text style={[styles.tableCell, { width: 60 }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { width: 60 }]}>{fulfilled}</Text>
                <Text style={[styles.tableCell, { width: 180 }]}>
                  {weightsArray.length > 0 ? weightsArray.join(', ') : '-'}
                </Text>
                <Text style={[styles.tableCell, { width: 70 }]}>
                  {totalWeight > 0 ? totalWeight.toFixed(2) : '-'}
                </Text>
                <Text style={[styles.tableCell, { width: 70 }]}>
                  {totalWeight > 0 ? avgWeight : '-'}
                </Text>
                <View style={[styles.tableCell, { width: 80, justifyContent: 'center', alignItems: 'center' }]}>
                  <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer Info */}
      <View style={styles.footerInfo}>
        <Text style={styles.footerText}>
          📋 Swipe left/right to see all columns
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  infoSection: {
    backgroundColor: Colors.card,
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brand,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  infoLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
  },
  tableContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: Spacing.md,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  tableCell: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    fontSize: FontSize.sm,
    color: Colors.text,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  tableHeader: {
    backgroundColor: Colors.brand + '15',
    fontWeight: '600',
    color: Colors.brand,
  },
  variantName: {
    fontWeight: '600',
    color: Colors.text,
  },
  variantSize: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  footerInfo: {
    padding: Spacing.md,
    backgroundColor: Colors.brand + '10',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: FontSize.md,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
