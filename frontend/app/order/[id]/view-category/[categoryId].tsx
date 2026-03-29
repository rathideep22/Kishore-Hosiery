import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
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
  quantity: number;
  rate?: string;
  requireSerialNo?: boolean;
  serialNumbers?: (string | null)[];
  fulfillment?: (number | null)[];
}

interface Order {
  id: string;
  orderId: string;
  partyName: string;
  location: string;
  items: OrderItem[];
}

export default function ViewCategoryScreen() {
  const { id: orderId, categoryId } = useLocalSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/orders/${orderId}`);
      setOrder(response);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      Alert.alert('Error', 'Failed to load order');
    } finally {
      setLoading(false);
    }
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

  const categoryItems = order.items.filter(item => item.category === categoryId);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.brand} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{categoryId}</Text>
          <Text style={styles.headerSubtitle}>{categoryItems.length} variant(s)</Text>
        </View>
      </View>

      {/* Order Info */}
      <View style={styles.infoBox}>
        <View style={styles.infoPair}>
          <Text style={styles.infoLabel}>Order:</Text>
          <Text style={styles.infoValue}>{order.orderId}</Text>
        </View>
        <View style={styles.infoPair}>
          <Text style={styles.infoLabel}>Party:</Text>
          <Text style={styles.infoValue}>{order.partyName}</Text>
        </View>
      </View>

      {/* Variants with Table View */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {categoryItems.map((item) => {
          const totalWeight = ((item.fulfillment || []).reduce((sum: number, w) => sum + (w || 0), 0)).toFixed(2);
          const fulfilledCount = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;

          return (
            <View key={item.productId} style={styles.variantSection}>
              {/* Variant Header */}
              <View style={styles.variantHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.variantName}>{item.alias}</Text>
                  <Text style={styles.variantSize}>{item.size}</Text>
                </View>
                {item.requireSerialNo && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, gap: 4 }}>
                    <Ionicons name="barcode-outline" size={14} color={Colors.brand} />
                    <Text style={{ fontSize: 12, color: Colors.brand, fontWeight: '700' }}>Serial Required</Text>
                  </View>
                )}
              </View>

              {/* Table */}
              <View style={styles.table}>
                {/* Table Header */}
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.tableCellHeader, styles.cellParcel]}>Parcel</Text>
                  {item.requireSerialNo && (
                    <Text style={[styles.tableCell, styles.tableCellHeader, styles.cellSerial]}>Serial No</Text>
                  )}
                  <Text style={[styles.tableCell, styles.tableCellHeader, styles.cellWeight]}>Weight (kg)</Text>
                </View>

                {/* Table Rows */}
                {Array.from({ length: item.quantity }).map((_, idx) => {
                  const weight = item.fulfillment?.[idx];
                  const hasWeight = weight !== null && weight !== undefined;
                  const serial = (item.serialNumbers || [])[idx];
                  const hasSerial = serial && serial.trim() !== '';

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.tableRow,
                        hasWeight && styles.tableRowFilled,
                        !hasWeight && styles.tableRowEmpty,
                      ]}
                    >
                      <Text style={[styles.tableCell, styles.cellParcel, { fontWeight: '600' }]}>
                        P{idx + 1}
                      </Text>
                      {item.requireSerialNo && (
                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellSerial,
                            !hasSerial && styles.cellMissing,
                          ]}
                          numberOfLines={1}
                        >
                          {hasSerial ? serial : '—'}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.tableCell,
                          styles.cellWeight,
                          hasWeight && styles.cellFilledWeight,
                          !hasWeight && styles.cellEmptyWeight,
                        ]}
                      >
                        {hasWeight ? Number(weight).toFixed(2) : '—'}
                      </Text>
                    </View>
                  );
                })}

                {/* Table Footer - Total Row */}
                <View style={[styles.tableRow, styles.tableTotalRow]}>
                  <Text style={[styles.tableCell, styles.cellParcel, { fontWeight: '700' }]}>
                    Total
                  </Text>
                  {item.requireSerialNo && (
                    <Text style={[styles.tableCell, styles.cellSerial, { fontWeight: '600' }]}>
                      {fulfilledCount}/{item.quantity}
                    </Text>
                  )}
                  <Text style={[styles.tableCell, styles.cellWeight, { fontWeight: '700', color: Colors.brand }]}>
                    {totalWeight}
                  </Text>
                </View>
              </View>

              {/* Summary Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Quantity</Text>
                  <Text style={styles.statValue}>{item.quantity}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Fulfilled</Text>
                  <Text style={[styles.statValue, { color: fulfilledCount === item.quantity ? Colors.success : fulfilledCount > 0 ? Colors.warning : Colors.danger }]}>
                    {fulfilledCount}
                  </Text>
                </View>
                <View style={[styles.statBox, { flex: 1.2 }]}>
                  <Text style={styles.statLabel}>Total Weight</Text>
                  <Text style={[styles.statValue, { color: Colors.brand }]}>{totalWeight} kg</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Back Button Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButtonFooter}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textInverse} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
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
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  infoBox: {
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brand,
  },
  infoPair: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  variantSection: {
    marginVertical: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  variantHeader: {
    marginBottom: Spacing.md,
  },
  variantName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  variantSize: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  table: {
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  tableRowFilled: {
    backgroundColor: Colors.success + '08',
  },
  tableRowEmpty: {
    backgroundColor: Colors.warning + '08',
  },
  tableTotalRow: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 0,
    fontWeight: '700',
  },
  tableCell: {
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
  },
  tableCellHeader: {
    fontWeight: '700',
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
  },
  cellParcel: {
    flex: 0.6,
    textAlign: 'center',
  },
  cellSerial: {
    flex: 1.2,
  },
  cellWeight: {
    flex: 0.8,
    textAlign: 'right',
  },
  cellMissing: {
    color: Colors.danger,
    fontWeight: '600',
  },
  cellFilledWeight: {
    color: Colors.success,
    fontWeight: '600',
  },
  cellEmptyWeight: {
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: '500',
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backButtonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    gap: Spacing.sm,
  },
  backButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  errorText: {
    fontSize: FontSize.md,
    color: Colors.danger,
    textAlign: 'center',
  },
});
