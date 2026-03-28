import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../utils/api';
import { Colors, FontSize, Spacing } from '../constants/theme';

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

interface FulfillmentSummary {
  category: string;
  fulfilled: number;
  total: number;
}

const screenWidth = Dimensions.get('window').width;
const DEBOUNCE_DELAY = 800; // ms to wait after user stops typing

export function OrderFulfillment({
  items = [],
  orderId,
  totalParcels,
  onUpdate,
  isAdmin = false,
}: {
  items: OrderItem[];
  orderId: string;
  totalParcels: number;
  onUpdate: (updatedItems: OrderItem[]) => void;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({}); // Local input state for unsynced typing
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({}); // Track which categories are expanded
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({}); // Track which variants are expanded
  const [tableViewCategory, setTableViewCategory] = useState<string | null>(null); // Track which category is in table view
  const scrollViewRef = useRef<ScrollView>(null);
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const lastSubmittedRef = useRef<Record<string, string>>({}); // Track last submitted value
  const inputRefs = useRef<Record<string, any>>({}); // Refs to TextInput components
  const variantPositionsRef = useRef<Record<string, number>>({}); // Track Y position of each variant
  const [lastOpenedVariant, setLastOpenedVariant] = useState<string | null>(null); // Track which variant was just opened

  const submitWeight = useCallback(async (productId: string, parcelIndex: number, weight: string) => {
    if (!weight || isNaN(parseFloat(weight))) return;

    if (!orderId) {
      Alert.alert('Error', 'Order ID is missing');
      return;
    }

    const key = `${productId}-${parcelIndex}`;

    // Prevent duplicate submissions of same value
    if (lastSubmittedRef.current[key] === weight) {
      console.log(`[SKIPPED] Duplicate submission: ${key} = ${weight}`);
      return;
    }

    console.log(`[SUBMIT START] ${key} = ${weight}`);
    lastSubmittedRef.current[key] = weight;
    setSaving(key);
    try {
      // Parse and round to 2 decimal places
      const weightValue = Math.round(parseFloat(weight) * 100) / 100;

      console.log(`[API CALL] ${key} weight=${weightValue}`);
      const response = await api.put(`/orders/${orderId}/fulfill`, {
        productId,
        parcelIndex,
        weight: weightValue,
      });

      console.log(`[API SUCCESS] ${key} - weight saved successfully`);

      // Update parent with response so UI shows saved values
      if (response.items) {
        onUpdate(response.items);
      }

      // Clear local input state after successful save
      setInputValues(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });

      // Auto-focus next parcel input
      setTimeout(() => {
        const currentParcelIndex = parcelIndex;
        const nextKey = `${productId}-${currentParcelIndex + 1}`;

        if (inputRefs.current[nextKey]) {
          // Next parcel in same product exists
          inputRefs.current[nextKey].focus();
        } else {
          // Find next product's first parcel
          const allKeys = Object.keys(inputRefs.current).sort();
          const currentKeyIndex = allKeys.indexOf(key);
          if (currentKeyIndex < allKeys.length - 1) {
            inputRefs.current[allKeys[currentKeyIndex + 1]].focus();
          }
        }
      }, 100);

      console.log(`[SUBMIT END] ${key}`);
    } catch (e: any) {
      console.error('Error saving weight:', e.message);
    } finally {
      setSaving(null);
    }
  }, [orderId, onUpdate]);

  const handleWeightChange = (productId: string, parcelIndex: number, weight: string) => {
    const key = `${productId}-${parcelIndex}`;

    // Allow only numbers and single decimal point
    const validatedWeight = weight.replace(/[^0-9.]/g, '');
    const decimalCount = (validatedWeight.match(/\./g) || []).length;
    const cleanedWeight = decimalCount > 1
      ? validatedWeight.substring(0, validatedWeight.lastIndexOf('.'))
      : validatedWeight;

    // Update local input state immediately for real-time UI feedback
    setInputValues(prev => ({
      ...prev,
      [key]: cleanedWeight,
    }));

    // Clear existing debounce timer
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
    }

    // Only submit if weight is not empty and valid
    if (cleanedWeight && !isNaN(parseFloat(cleanedWeight))) {
      // Set new timer - submit after user stops typing
      debounceTimersRef.current[key] = setTimeout(() => {
        submitWeight(productId, parcelIndex, cleanedWeight);
        delete debounceTimersRef.current[key];
      }, DEBOUNCE_DELAY);
    }
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Auto-scroll to opened variant
  useEffect(() => {
    if (lastOpenedVariant && variantPositionsRef.current[lastOpenedVariant]) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: variantPositionsRef.current[lastOpenedVariant] - 100,
          animated: true,
        });
        setLastOpenedVariant(null);
      }, 100);
    }
  }, [lastOpenedVariant]);

  const getVariantStatus = (item: OrderItem) => {
    const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
    const total = item.quantity;
    const percentage = total > 0 ? (fulfilled / total) * 100 : 0;

    if (percentage === 0) return { color: Colors.danger, label: 'PENDING', percentage: 0 };
    if (percentage === 100) return { color: Colors.success, label: 'READY', percentage: 100 };
    return { color: Colors.warning, label: 'PARTIAL', percentage };
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const toggleVariant = (productId: string) => {
    setExpandedVariants(prev => {
      const isCurrentlyOpen = prev[productId];

      if (isCurrentlyOpen) {
        // Closing this variant
        const newState = { ...prev };
        newState[productId] = false;
        return newState;
      } else {
        // Opening this variant, close all others
        const newState = { ...prev };
        // Close all variants
        for (const key in newState) {
          newState[key] = false;
        }
        // Open only this one
        newState[productId] = true;
        // Track that this variant was just opened for auto-scroll
        setLastOpenedVariant(productId);
        return newState;
      }
    });
  };

  const getSummary = (): FulfillmentSummary[] => {
    const summary: Record<string, FulfillmentSummary> = {};

    items.forEach(item => {
      if (!summary[item.category]) {
        summary[item.category] = { category: item.category, fulfilled: 0, total: 0 };
      }
      const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
      summary[item.category].fulfilled += fulfilled;
      summary[item.category].total += item.quantity;
    });

    return Object.values(summary);
  };

  const totalFulfilled = items.reduce(
    (sum, item) => sum + (item.fulfillment || []).filter(w => w !== null && w !== undefined).length,
    0
  );

  // Group items by category
  const groupedByCategory = items.reduce(
    (acc, item) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {} as Record<string, OrderItem[]>
  );

  const parcelInputSize = ((screenWidth - Spacing.lg * 2 - Spacing.md * 2.5) / 3.2) * 0.75;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerLabel}>ORDER FULFILLMENT</Text>
            <View style={styles.headerProgressRow}>
              <Text style={styles.headerProgress}>{totalFulfilled}</Text>
              <Text style={styles.headerProgressSlash}>/</Text>
              <Text style={styles.headerProgress}>{totalParcels}</Text>
              <Text style={styles.headerProgressLabel}>parcels</Text>
            </View>
          </View>
          <View style={[
            styles.progressBadge,
            {
              backgroundColor:
                totalFulfilled === totalParcels
                  ? Colors.success + '15'
                  : totalFulfilled > 0
                  ? Colors.warning + '15'
                  : Colors.danger + '15',
            },
          ]}>
            <Text style={[
              styles.progressBadgeText,
              {
                color:
                  totalFulfilled === totalParcels
                    ? Colors.success
                    : totalFulfilled > 0
                    ? Colors.warning
                    : Colors.danger,
              },
            ]}>
              {totalFulfilled === totalParcels ? 'COMPLETE' : totalFulfilled > 0 ? 'IN PROGRESS' : 'PENDING'}
            </Text>
          </View>
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressIndicator}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.min((totalFulfilled / totalParcels) * 100, 100)}%`,
                  backgroundColor:
                    totalFulfilled === totalParcels
                      ? Colors.success
                      : totalFulfilled > 0
                      ? Colors.warning
                      : Colors.danger,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Items */}
      <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
        {Object.entries(groupedByCategory).map(([category, categoryItems]) => {
          const isCategoryExpanded = expandedCategories[category] !== false; // Default to expanded
          return (
            <View key={category} style={styles.categorySection}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name={isCategoryExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color={Colors.brand}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.categoryName}>{category}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Text style={styles.categoryCount}>{categoryItems.length} variant(s)</Text>
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => setTableViewCategory(tableViewCategory === category ? null : category)}
                      style={[styles.viewDetailsButton, tableViewCategory === category && styles.viewDetailsButtonActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={tableViewCategory === category ? "list" : "list-outline"} size={16} color={Colors.brand} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>

              {/* Table View for Admin */}
              {isCategoryExpanded && isAdmin && tableViewCategory === category && (
                <View style={styles.tableViewContainer}>
                  {/* Table Header */}
                  <View style={styles.tableRowHeader}>
                    <Text style={[styles.tableCell, { flex: 1 }]}>Variant</Text>
                    <Text style={[styles.tableCell, { width: 50, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[styles.tableCell, { width: 50, textAlign: 'center' }]}>Done</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>Weights</Text>
                  </View>

                  {/* Table Body */}
                  {categoryItems.map((item) => {
                    const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
                    const weights = (item.fulfillment || [])
                      .map((w, idx) => w ? `${w.toFixed(2)}` : null)
                      .filter(w => w !== null)
                      .join(', ');
                    const status = getVariantStatus(item);

                    return (
                      <View key={item.productId} style={styles.tableRowBody}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tableCellText}>{item.alias}</Text>
                          <Text style={styles.tableCellSmall}>{item.size}</Text>
                        </View>
                        <Text style={[styles.tableCell, { width: 50, textAlign: 'center', color: Colors.text }]}>{item.quantity}</Text>
                        <Text style={[styles.tableCell, { width: 50, textAlign: 'center', color: Colors.text }]}>{fulfilled}</Text>
                        <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                          <Text style={[styles.tableCellSmall, { flex: 1 }]}>{weights || '-'}</Text>
                          <View style={[styles.statusBadgeSmall, { backgroundColor: status.color + '20' }]}>
                            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Collapsible Variants View */}
              {isCategoryExpanded && !(isAdmin && tableViewCategory === category) && categoryItems.map(item => {
                const variantStatus = getVariantStatus(item);
                const isVariantExpanded = expandedVariants[item.productId];

                return (
                  <View
                    key={item.productId}
                    style={styles.variantCard}
                    onLayout={(e) => {
                      variantPositionsRef.current[item.productId] = e.nativeEvent.layout.y;
                    }}
                  >
                    <TouchableOpacity
                      style={styles.variantMeta}
                      onPress={() => toggleVariant(item.productId)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons
                          name={isVariantExpanded ? 'chevron-down' : 'chevron-forward'}
                          size={14}
                          color={Colors.text}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.variantSize}>{item.size}</Text>
                      </View>
                      <View
                        style={[
                          styles.variantStatusBadge,
                          { backgroundColor: variantStatus.color + '15', borderColor: variantStatus.color + '30' },
                        ]}
                      >
                        <Text style={[styles.variantStatus, { color: variantStatus.color }]}>
                          {variantStatus.label}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {isVariantExpanded && (
                      <View style={styles.parcelsGrid}>
                    {Array.from({ length: item.quantity }).map((_, parcelIndex) => {
                      const key = `${item.productId}-${parcelIndex}`;
                      // Use local input state if typing, otherwise use fulfillment data
                      const weight = inputValues[key] !== undefined ? inputValues[key] : (item.fulfillment?.[parcelIndex] ?? null);

                      return (
                        <View
                          key={parcelIndex}
                          style={[styles.parcelInputWrapper, { width: parcelInputSize }]}
                        >
                          <TextInput
                            ref={(r) => {
                              if (r) inputRefs.current[key] = r;
                            }}
                            style={[
                              styles.weightInput,
                              weight !== null && styles.weightInputFilled,
                              saving === key && styles.weightInputLoading,
                            ]}
                            placeholder={`P${parcelIndex + 1}`}
                            placeholderTextColor={Colors.textSecondary}
                            value={
                              weight !== null
                                ? typeof weight === 'string'
                                  ? weight
                                  : weight.toFixed(2)
                                : ''
                            }
                            onChangeText={(val) =>
                              handleWeightChange(item.productId, parcelIndex, val)
                            }
                            keyboardType="decimal-pad"
                            editable={!saving}
                            maxLength={8}
                          />

                          {saving === key && (
                            <View style={styles.savingIndicator}>
                              <ActivityIndicator size="small" color={Colors.brand} />
                            </View>
                          )}

                        </View>
                      );
                    })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Summary */}
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>SUMMARY</Text>

        {getSummary().map((cat, idx) => {
          const isComplete = cat.fulfilled === cat.total;
          const isPartial = cat.fulfilled > 0 && cat.fulfilled < cat.total;
          const badgeColor = isComplete ? Colors.success : isPartial ? Colors.warning : Colors.danger;

          return (
            <View key={cat.category} style={styles.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryCategory}>{cat.category}</Text>
              </View>
              <View style={[
                styles.summaryBadge,
                { backgroundColor: badgeColor + '15', borderColor: badgeColor + '30' },
              ]}>
                <Text style={[styles.summaryValue, { color: badgeColor }]}>
                  {cat.fulfilled}/{cat.total}
                </Text>
                {isComplete && <Ionicons name="checkmark" size={12} color={badgeColor} />}
              </View>
            </View>
          );
        })}

        <View style={styles.okButtonContainer}>
          <TouchableOpacity
            style={styles.okButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  headerProgressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  headerProgress: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
  },
  headerProgressSlash: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  headerProgressLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  progressBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressIndicator: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 35,
    textAlign: 'right',
  },

  // Items
  itemsContainer: { flex: 1, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  categorySection: { marginBottom: Spacing.md },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingLeft: Spacing.md,
    backgroundColor: Colors.brand + '08',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brand,
    borderWidth: 1,
    borderColor: Colors.brand + '20',
  },
  categoryName: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.brand,
    letterSpacing: 0.3,
  },
  categoryCount: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewDetailsButton: {
    padding: Spacing.xs,
    borderRadius: 6,
    backgroundColor: Colors.brand + '15',
  },
  viewDetailsButtonActive: {
    backgroundColor: Colors.brand + '30',
  },

  // Table View Styles
  tableViewContainer: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    marginHorizontal: Spacing.sm,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.brand + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableRowBody: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.brand,
  },
  tableCellText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  tableCellSmall: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  statusBadgeSmall: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },

  // Variant Card
  variantCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    shadowColor: Colors.text,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  variantMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingLeft: Spacing.md,
    backgroundColor: Colors.bgSecondary + '40',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    marginBottom: 0,
  },
  variantSize: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  variantAlias: {
    fontSize: FontSize.xs,
    color: Colors.info,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  variantStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  variantStatus: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Parcels Grid
  parcelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.bg,
  },
  parcelInputWrapper: {
    position: 'relative',
    flex: 1,
    minWidth: '22%',
  },
  weightInput: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    height: 56,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: 0.5,
    shadowColor: Colors.text,
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  weightInputFilled: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '12',
    borderWidth: 2.5,
    shadowColor: Colors.success,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  weightInputLoading: {
    opacity: 0.7,
  },
  savingIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: Spacing.xs,
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -24,
    marginTop: -24,
    zIndex: 10,
  },

  // Summary
  summarySection: {
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  summaryTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCategory: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  okButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.lg,
  },
  okButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  okButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },

});
