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

      {/* Variants with Weights */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {categoryItems.map((item) => (
          <View key={item.productId} style={styles.variantSection}>
            <View style={styles.variantHeader}>
              <Text style={styles.variantName}>{item.alias}</Text>
              <Text style={styles.variantSize}>{item.size}</Text>
            </View>

            {/* Parcels Grid */}
            <View style={styles.parcelsGrid}>
              {Array.from({ length: item.quantity }).map((_, idx) => {
                const weight = item.fulfillment?.[idx];
                const hasWeight = weight !== null && weight !== undefined;
                const backgroundColor = hasWeight ? Colors.success : Colors.warning;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.parcelBox,
                      { borderColor: backgroundColor, backgroundColor: backgroundColor + '15' },
                    ]}
                  >
                    <Text style={styles.parcelLabel}>P{idx + 1}</Text>
                    <Text style={[styles.parcelWeight, { color: backgroundColor }]}>
                      {hasWeight ? `${weight.toFixed(2)}kg` : 'Empty'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Qty:</Text>
                <Text style={styles.summaryValue}>{item.quantity}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Fulfilled:</Text>
                <Text style={styles.summaryValue}>
                  {(item.fulfillment || []).filter(w => w !== null && w !== undefined).length}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Weight:</Text>
                <Text style={styles.summaryValue}>
                  {((item.fulfillment || [])
                    .reduce((sum: number, w) => sum + (w || 0), 0))
                    .toFixed(2)}kg
                </Text>
              </View>
            </View>
          </View>
        ))}

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
  parcelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  parcelBox: {
    flex: 1,
    minWidth: 80,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parcelLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  parcelWeight: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  summaryValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.brand,
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
