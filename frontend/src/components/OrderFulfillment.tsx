import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, Alert, Animated, Keyboard, Switch, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../utils/api';
import { Colors, FontSize, Spacing } from '../constants/theme';
import { useResponsive } from '../utils/responsive';

interface OrderItem {
  productId: string;
  alias: string;
  category: string;
  size: string;
  printName: string;
  quantity: number;
  rate?: string;
  requireSerialNo?: boolean;
  serialNumbers?: (string | null)[];
  fulfillment?: (number | null)[];
}

interface FulfillmentSummary {
  category: string;
  fulfilled: number;
  total: number;
  rate?: string;
  totalWeight: number;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const DEBOUNCE_DELAY = 800;

export function OrderFulfillment({
  items = [],
  orderId,
  totalParcels,
  onUpdate,
  isAdmin = false,
  readinessStatus = 'Pending',
  dispatched = false,
  onSplitPress,
}: {
  items: OrderItem[];
  orderId: string;
  totalParcels: number;
  onUpdate: (updatedItems: OrderItem[]) => void;
  isAdmin?: boolean;
  readinessStatus?: string;
  dispatched?: boolean;
  onSplitPress?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useResponsive();
  const isNarrow = width < 420;
  const [saving, setSaving] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [serialValues, setSerialValues] = useState<Record<string, string>>({});
  const [enableAutoAdvance, setEnableAutoAdvance] = useState(true);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(2000);
  // Active slot = {productId, parcelIndex} — the one being typed into
  const [activeSlot, setActiveSlot] = useState<{ productId: string; parcelIndex: number } | null>(null);
  const latestSerialsRef = useRef<Record<string, string>>({});
  // Expanded category tracking
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [tableViewCategory, setTableViewCategory] = useState<string | null>(null);
  const debounceTimersRef = useRef<Record<string, any>>({});
  const lastSubmittedRef = useRef<Record<string, string>>({});
  const weightInputRef = useRef<TextInput>(null);
  const serialInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const autoAdvanceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Show/hide entry panel when activeSlot changes
  useEffect(() => {
    Animated.spring(panelAnim, {
      toValue: activeSlot ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    if (activeSlot) {
      setTimeout(() => {
        const item = items.find(i => i.productId === activeSlot.productId);
        const slotKey = `${activeSlot.productId}-${activeSlot.parcelIndex}`;
        // CRITICAL: Check both prop and the LATEST local ref (to handle fast scans)
        const hasSerial = (item?.serialNumbers?.[activeSlot.parcelIndex]) || (latestSerialsRef.current[slotKey]);
        
        if (item?.requireSerialNo && !hasSerial) {
          serialInputRef.current?.focus();
        } else {
          weightInputRef.current?.focus();
        }
      }, 300);
    }
  }, [activeSlot?.productId, activeSlot?.parcelIndex]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const submitFulfillment = useCallback(async (productId: string, parcelIndex: number, weight: string | null, serialNo: string | null) => {
    if (!orderId) { Alert.alert('Error', 'Order ID is missing'); return; }
    const key = `${productId}-${parcelIndex}`;
    const submittedValue = `${weight || ''}|${serialNo || ''}`;
    if (lastSubmittedRef.current[key] === submittedValue) return;
    lastSubmittedRef.current[key] = submittedValue;
    setSaving(key);
    try {
      const weightValue = weight && !isNaN(parseFloat(weight)) ? Math.round(parseFloat(weight) * 100) / 100 : null;
      const serialValue = serialNo && serialNo.trim() ? serialNo.trim() : null;
      const payload: any = {
        productId,
        parcelIndex,
        weight: weightValue,
        serialNo: serialValue
      };

      console.log('📤 Sending fulfillment update:', payload);
      const response = await api.put(`/orders/${orderId}/fulfill`, payload);
      if (response.items) {
        onUpdate(response.items);
        
        // Find the updated item in the response
        const updatedItem = response.items.find((i: any) => i.productId === productId);
        if (updatedItem) {
          // CHECK IF CURRENT PARCEL IS FULLY DONE
          const currentWeight = updatedItem.fulfillment?.[parcelIndex];
          const currentSerial = updatedItem.serialNumbers?.[parcelIndex];
          const hasWeight = currentWeight !== null && currentWeight !== undefined;
          const hasSerial = !updatedItem.requireSerialNo || (currentSerial && currentSerial.trim() !== '');
          
          // If current parcel isn't finished yet (e.g. just saved serial but waiting for weight),
          // DO NOT advance to the next parcel.
          if (!hasWeight || !hasSerial) {
            return;
          }

          // ONLY ADVANCE if current is done
          const fulfilled = (updatedItem.fulfillment || []).filter((w: any) => w !== null && w !== undefined).length;
          if (fulfilled < updatedItem.quantity) {
            // Find next unfilled in THIS variant
            const nextUnfilled = (updatedItem.fulfillment || []).findIndex((w: any, idx: number) => idx > parcelIndex && (w === null || w === undefined));
            if (nextUnfilled !== -1) {
              setTimeout(() => setActiveSlot({ productId, parcelIndex: nextUnfilled }), 200);
            } else {
              // Find next unfilled in SAME CATEGORY only
              const allItems: OrderItem[] = response.items;
              const currentCategory = updatedItem.category;
              let advanced = false;
              for (const nextItem of allItems) {
                if (nextItem.productId === productId || nextItem.category !== currentCategory) continue;
                const nextFulfilled = (nextItem.fulfillment || []).filter((w: any) => w !== null && w !== undefined).length;
                if (nextFulfilled < nextItem.quantity) {
                  const nextIdx = (nextItem.fulfillment || []).findIndex((w: any) => w === null || w === undefined);
                  setTimeout(() => setActiveSlot({ productId: nextItem.productId, parcelIndex: nextIdx === -1 ? 0 : nextIdx }), 200);
                  advanced = true;
                  break;
                }
              }
              // Category done — close input panel
              if (!advanced) setTimeout(() => setActiveSlot(null), 300);
            }
          } else {
            // This variant done; find next in SAME CATEGORY only
            const allItems: OrderItem[] = response.items;
            const currentCategory = updatedItem.category;
            let advanced = false;
            for (const nextItem of allItems) {
              if (nextItem.productId === productId || nextItem.category !== currentCategory) continue;
              const nextFulfilled = (nextItem.fulfillment || []).filter((w: any) => w !== null && w !== undefined).length;
              if (nextFulfilled < nextItem.quantity) {
                const nextIdx = (nextItem.fulfillment || []).findIndex((w: any) => w === null || w === undefined);
                setTimeout(() => setActiveSlot({ productId: nextItem.productId, parcelIndex: nextIdx === -1 ? 0 : nextIdx }), 200);
                advanced = true;
                break;
              }
            }
            // Category done — close input panel
            if (!advanced) setTimeout(() => setActiveSlot(null), 300);
          }
        }
      }
      setInputValues(prev => { const u = { ...prev }; delete u[key]; return u; });
      setSerialValues(prev => { const u = { ...prev }; delete u[key]; return u; });
    } catch (e: any) {
      console.error('Error saving:', e.message);
    } finally {
      setSaving(null);
    }
  }, [orderId, onUpdate]);

  // Cleanup auto-advance timers on unmount
  useEffect(() => {
    return () => {
      Object.values(autoAdvanceTimersRef.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  const handleFulfillmentChange = (productId: string, parcelIndex: number, field: 'weight' | 'serialNo', value: string) => {
    const key = `${productId}-${parcelIndex}`;
    let cleaned = value;
    if (field === 'weight') {
      const v = value.replace(/[^0-9.]/g, '');
      const dots = (v.match(/\./g) || []).length;
      cleaned = dots > 1 ? v.substring(0, v.lastIndexOf('.')) : v;
      setInputValues(prev => ({ ...prev, [key]: cleaned }));
    } else {
      setSerialValues(prev => ({ ...prev, [key]: cleaned }));
      latestSerialsRef.current[key] = cleaned;
    }
    if (debounceTimersRef.current[key]) clearTimeout(debounceTimersRef.current[key]);
    const currentItem = items.find(i => i.productId === productId);
    if (field === 'serialNo') {
      // Only submit serial — don't send weight so the parcel stays "incomplete" and doesn't auto-advance
      if (cleaned) {
        debounceTimersRef.current[key] = setTimeout(() => {
          submitFulfillment(productId, parcelIndex, null, cleaned);
          // Auto-advance to weight: immediately on enter, or after delay if enabled
          if (enableAutoAdvance) {
            if (autoAdvanceTimersRef.current[key]) clearTimeout(autoAdvanceTimersRef.current[key]);
            autoAdvanceTimersRef.current[key] = setTimeout(() => {
              weightInputRef.current?.focus();
              delete autoAdvanceTimersRef.current[key];
            }, autoAdvanceDelay);
          } else {
            setTimeout(() => weightInputRef.current?.focus(), 100);
          }
          delete debounceTimersRef.current[key];
        }, DEBOUNCE_DELAY);
      }
    } else {
      const existingSerial = serialValues[key] ?? (currentItem?.serialNumbers?.[parcelIndex] || null);
      if (cleaned || existingSerial) {
        debounceTimersRef.current[key] = setTimeout(() => {
          submitFulfillment(productId, parcelIndex, cleaned, existingSerial);
          // Auto-advance to next parcel after weight is saved
          if (enableAutoAdvance && cleaned) {
            if (autoAdvanceTimersRef.current[key]) clearTimeout(autoAdvanceTimersRef.current[key]);
            autoAdvanceTimersRef.current[key] = setTimeout(() => {
              // Move to next parcel
              if (parcelIndex < currentItem!.quantity - 1) {
                setActiveSlot({ productId, parcelIndex: parcelIndex + 1 });
              }
              delete autoAdvanceTimersRef.current[key];
            }, autoAdvanceDelay);
          }
          delete debounceTimersRef.current[key];
        }, DEBOUNCE_DELAY);
      }
    }
  };

  const getVariantStatus = (item: OrderItem) => {
    const fulfilled = (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
    const pct = item.quantity > 0 ? (fulfilled / item.quantity) * 100 : 0;
    if (pct === 0) return { color: Colors.danger, label: 'PENDING', pct: 0, fulfilled };
    if (pct === 100) return { color: Colors.success, label: 'DONE', pct: 100, fulfilled };
    return { color: Colors.warning, label: 'PARTIAL', pct, fulfilled };
  };

  const getSummary = (): FulfillmentSummary[] => {
    const s: Record<string, FulfillmentSummary> = {};
    items.forEach(item => {
      if (!s[item.category]) {
        s[item.category] = {
          category: item.category,
          fulfilled: 0,
          total: 0,
          rate: item.rate,
          totalWeight: 0
        };
      }
      s[item.category].fulfilled += (item.fulfillment || []).filter(w => w !== null && w !== undefined).length;
      s[item.category].total += item.quantity;
      // Sum all weights in this category
      const weights = (item.fulfillment || []).filter(w => w !== null && w !== undefined) as number[];
      s[item.category].totalWeight += weights.reduce((sum, w) => sum + w, 0);
    });
    return Object.values(s);
  };

  const totalFulfilled = items.reduce((acc, item) => acc + (item.fulfillment || []).filter(w => w !== null && w !== undefined).length, 0);
  const groupedByCategory = items.reduce((acc: Record<string, OrderItem[]>, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const activeItem = activeSlot ? items.find(i => i.productId === activeSlot.productId) : null;
  const activeKey = activeSlot ? `${activeSlot.productId}-${activeSlot.parcelIndex}` : null;
  const activeWeight = activeKey ? (inputValues[activeKey] ?? (activeItem?.fulfillment?.[activeSlot!.parcelIndex] !== null && activeItem?.fulfillment?.[activeSlot!.parcelIndex] !== undefined ? String(activeItem?.fulfillment?.[activeSlot!.parcelIndex]) : '')) : '';
  const activeSerial = activeKey ? (serialValues[activeKey] ?? (activeItem?.serialNumbers?.[activeSlot!.parcelIndex] || '')) : '';

  const panelTranslateY = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  // Find first unfilled parcel across all items to support "Start" button
  const findFirstUnfilled = () => {
    for (const item of items) {
      const idx = (item.fulfillment || []).findIndex((w, i) => (w === null || w === undefined) && i < item.quantity);
      if (idx !== -1) return { productId: item.productId, parcelIndex: idx };
      if ((item.fulfillment || []).length < item.quantity) return { productId: item.productId, parcelIndex: (item.fulfillment || []).length };
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* ── Variant List ── */}
      <ScrollView ref={scrollViewRef} style={styles.itemsContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* ── Progress Header (scrolls with content) ── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerLabel}>FULFILLMENT PROGRESS</Text>
              <View style={styles.headerProgressRow}>
                <Text style={styles.headerProgress}>{totalFulfilled}</Text>
                <Text style={styles.headerProgressSlash}>/</Text>
                <Text style={styles.headerProgress}>{totalParcels}</Text>
                <Text style={styles.headerProgressLabel}>parcels</Text>
              </View>
            </View>
            <View style={[styles.progressBadge, { backgroundColor: totalFulfilled === totalParcels ? Colors.success + '20' : Colors.warning + '20', borderColor: totalFulfilled === totalParcels ? Colors.success : Colors.warning }]}>
              <Text style={[styles.progressBadgeText, { color: totalFulfilled === totalParcels ? Colors.success : totalFulfilled > 0 ? Colors.warning : Colors.danger }]}>
                {totalFulfilled === totalParcels ? 'COMPLETE' : totalFulfilled > 0 ? 'IN PROGRESS' : 'PENDING'}
              </Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${Math.min((totalFulfilled / Math.max(totalParcels, 1)) * 100, 100)}%` as any,
              backgroundColor: totalFulfilled === totalParcels ? Colors.success : Colors.warning,
            }]} />
          </View>
          {/* Quick start button */}
          {!activeSlot && totalFulfilled < totalParcels && (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => { const first = findFirstUnfilled(); if (first) setActiveSlot(first); }}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle" size={20} color="#FFF" />
              <Text style={styles.startBtnText}>Continue Entry</Text>
            </TouchableOpacity>
          )}
        </View>
        {Object.entries(groupedByCategory).map(([category, catItems]) => {
          const isExpanded = expandedCategories[category] !== false;
          const catFulfilled = catItems.reduce((acc, i) => acc + (i.fulfillment || []).filter(w => w !== null && w !== undefined).length, 0);
          const catTotal = catItems.reduce((a, i) => a + i.quantity, 0);
          return (
            <View key={category} style={styles.categorySection}>
              <TouchableOpacity style={styles.categoryHeader} onPress={() => setExpandedCategories(prev => ({ ...prev, [category]: !isExpanded }))} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{category}</Text>
                  <Text style={styles.categoryMeta}>{catFulfilled}/{catTotal} parcels</Text>
                </View>
                <View style={[styles.catBadge, { backgroundColor: catFulfilled === catTotal ? Colors.success + '20' : catFulfilled > 0 ? Colors.warning + '20' : Colors.danger + '15' }]}>
                  <Text style={[styles.catBadgeText, { color: catFulfilled === catTotal ? Colors.success : catFulfilled > 0 ? Colors.warning : Colors.danger }]}>
                    {catFulfilled === catTotal ? '✓ DONE' : `${catFulfilled}/${catTotal}`}
                  </Text>
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} style={{ marginLeft: 8 }} />
              </TouchableOpacity>

              {isExpanded && catItems.map(item => {
                const status = getVariantStatus(item);
                const isActive = activeSlot?.productId === item.productId;
                return (
                  <View key={item.productId} style={[styles.variantRow, isActive && styles.variantRowActive]}>
                    <View style={styles.variantLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.variantSize}>{item.size}</Text>
                        {item.requireSerialNo && (
                          <View style={styles.snBadge}>
                            <Ionicons name="barcode-outline" size={11} color={Colors.brand} />
                            <Text style={styles.snBadgeText}>S/N</Text>
                          </View>
                        )}
                      </View>
                      {/* Parcel dots */}
                      <View style={styles.parcelDots}>
                        {Array.from({ length: item.quantity }).map((_, idx) => {
                          const w = item.fulfillment?.[idx];
                          const done = w !== null && w !== undefined;
                          const isThisActive = activeSlot?.productId === item.productId && activeSlot?.parcelIndex === idx;
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => setActiveSlot({ productId: item.productId, parcelIndex: idx })}
                              style={[
                                styles.dot,
                                done && styles.dotDone,
                                isThisActive && styles.dotActive,
                              ]}
                              activeOpacity={0.7}
                            >
                              {done ? (
                                <Text style={styles.dotWeightText}>{Number(w).toFixed(0)}</Text>
                              ) : (
                                <Text style={styles.dotEmptyText}>{idx + 1}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.variantRight}>
                      <View style={[styles.variantStatusDot, { backgroundColor: status.color }]} />
                      <Text style={[styles.variantStatusText, { color: status.color }]}>{status.fulfilled}/{item.quantity}</Text>
                      {status.pct < 100 && (
                        <TouchableOpacity
                          style={styles.enterBtn}
                          onPress={() => {
                            const nextIdx = (item.fulfillment || []).findIndex((w, i) => (w === null || w === undefined) && i < item.quantity);
                            const slot = nextIdx !== -1 ? nextIdx : (item.fulfillment || []).length < item.quantity ? (item.fulfillment || []).length : 0;
                            setActiveSlot({ productId: item.productId, parcelIndex: slot });
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="pencil" size={14} color="#FFF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>SUMMARY</Text>
          {getSummary().map(cat => {
            const done = cat.fulfilled === cat.total;
            const partial = cat.fulfilled > 0 && !done;
            const badge = done ? Colors.success : partial ? Colors.warning : Colors.danger;
            return (
              <View key={cat.category}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryCategory}>{cat.category}</Text>
                  <View style={[styles.summaryBadge, { backgroundColor: badge + '20', borderColor: badge + '40' }]}>
                    <Text style={[styles.summaryValue, { color: badge }]}>{cat.fulfilled}/{cat.total}</Text>
                    {done && <Ionicons name="checkmark" size={12} color={badge} />}
                  </View>
                </View>
                <View style={styles.summaryDetails}>
                  {cat.rate && <Text style={styles.summaryRate}>₹{cat.rate}/unit</Text>}
                  {cat.totalWeight > 0 && <Text style={styles.summaryWeight}>{cat.totalWeight.toFixed(2)} kg</Text>}
                </View>
              </View>
            );
          })}
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>

          {/* Split Order button - below Done, visible when partially filled */}
          {!dispatched && (readinessStatus === 'Partial Ready' || readinessStatus === 'Pending') && onSplitPress && (
            <TouchableOpacity style={styles.splitBtn} onPress={onSplitPress} activeOpacity={0.85}>
              <Ionicons name="git-branch" size={18} color="#FFF" />
              <Text style={styles.splitBtnText}>Split Order</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: Math.max(280, insets.bottom + 100) }} />
      </ScrollView>

      {/* ── Bottom Entry Panel ── */}
      {activeSlot && activeItem && (
        <Animated.View style={[styles.entryPanel, { transform: [{ translateY: panelTranslateY }] }]}>
          {/* Drag handle */}
          <View style={styles.panelHandle} />

          <ScrollView style={styles.panelScrollable} showsVerticalScrollIndicator={false}>
          {/* Item header */}
          <View style={styles.panelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelVariant}>{activeItem.size}</Text>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.panelParcelLabel}>
                  Parcel <Text style={{ color: Colors.brand, fontWeight: '800' }}>{activeSlot.parcelIndex + 1}</Text> of {activeItem.quantity}
                </Text>
                {activeItem.rate && (
                  <Text style={styles.panelRateText}>₹{activeItem.rate}/unit</Text>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setActiveSlot(null); }} style={styles.panelClose}>
              <Ionicons name="close-circle" size={28} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Previous parcels history */}
          {activeSlot.parcelIndex > 0 && (
            <View style={styles.previousParcelsSection}>
              <Text style={styles.previousParcelsTitle}>Completed Parcels</Text>
              <ScrollView style={styles.previousParcelsScroll} horizontal={false} nestedScrollEnabled={true}>
                {Array.from({ length: activeSlot.parcelIndex }).map((_, idx) => {
                  const serial = activeItem.serialNumbers?.[idx] || null;
                  const weight = activeItem.fulfillment?.[idx] || null;
                  return (
                    <View key={idx} style={styles.previousParcelRow}>
                      <Text style={styles.previousParcelNum}>#{idx + 1}</Text>
                      <View style={styles.previousParcelDetails}>
                        {serial && <Text style={styles.previousParcelText}>SN: {serial}</Text>}
                        {weight && <Text style={styles.previousParcelText}>Weight: {weight} kg</Text>}
                        {!serial && !weight && <Text style={styles.previousParcelPlaceholder}>Empty</Text>}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Auto-advance settings */}
          <View style={[styles.settingsRowPanel, isNarrow && styles.settingsRowPanelNarrow]}>
            <View style={styles.settingItemPanel}>
              <Text style={styles.settingLabelPanel}>Auto-Advance</Text>
              <Switch
                value={enableAutoAdvance}
                onValueChange={setEnableAutoAdvance}
                trackColor={{ false: Colors.border, true: Colors.brand + '40' }}
                thumbColor={enableAutoAdvance ? Colors.brand : Colors.textSecondary}
              />
            </View>
            {enableAutoAdvance && (
              <View style={[styles.settingItemPanel, isNarrow && styles.settingItemPanelNarrow]}>
                <Text style={styles.settingLabelPanel}>Delay</Text>
                <View style={[styles.delayButtonsRowPanel, isNarrow && styles.delayButtonsRowPanelNarrow]}>
                  {[2000, 3000, 4000, 5000].map((delay) => (
                    <TouchableOpacity
                      key={delay}
                      style={[styles.delayBtnPanel, autoAdvanceDelay === delay && styles.delayBtnPanelActive]}
                      onPress={() => setAutoAdvanceDelay(delay)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.delayBtnTextPanel, autoAdvanceDelay === delay && styles.delayBtnTextPanelActive]}>
                        {delay / 1000}s
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Saving indicator */}
          {saving === activeKey && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={Colors.brand} />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          )}

          {/* Serial input (if required) */}
          {activeItem.requireSerialNo && (
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Ionicons name="barcode-outline" size={13} color={Colors.brand} />
                <Text style={styles.inputLabel}>Serial</Text>
              </View>
              <TextInput
                ref={serialInputRef}
                style={[styles.smallInput, activeSerial && styles.bigInputFilled]}
                placeholder="Scan or type"
                placeholderTextColor={Colors.textSecondary}
                value={activeSerial}
                onChangeText={val => handleFulfillmentChange(activeSlot.productId, activeSlot.parcelIndex, 'serialNo', val)}
                returnKeyType="next"
                onSubmitEditing={() => weightInputRef.current?.focus()}
                keyboardType="number-pad"
              />
            </View>
          )}

          {/* Weight input */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Ionicons name="scale-outline" size={16} color={Colors.brand} />
              <Text style={styles.inputLabel}>Weight (kg)</Text>
            </View>
            <View style={styles.inputWithButton}>
              <TextInput
                ref={weightInputRef}
                style={[styles.bigInput, styles.bigInputWeight, activeWeight && styles.bigInputFilled]}
                placeholder="0.00"
                placeholderTextColor={Colors.textSecondary}
                value={activeWeight}
                onChangeText={val => handleFulfillmentChange(activeSlot.productId, activeSlot.parcelIndex, 'weight', val)}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                onBlur={() => {
                  // Format weight on blur (when user leaves field)
                  if (activeWeight && !isNaN(parseFloat(activeWeight))) {
                    const formatted = Math.round(parseFloat(activeWeight) * 100) / 100;
                    handleFulfillmentChange(activeSlot.productId, activeSlot.parcelIndex, 'weight', formatted.toString());
                  }
                }}
                onSubmitEditing={() => {
                  const item = items.find(i => i.productId === activeSlot.productId);
                  const w = inputValues[activeKey!] ?? '';
                  const sn = serialValues[activeKey!] ?? null;
                  if (w) submitFulfillment(activeSlot.productId, activeSlot.parcelIndex, w, sn);
                }}
              />
              {activeWeight && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => handleFulfillmentChange(activeSlot.productId, activeSlot.parcelIndex, 'weight', '')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          </ScrollView>

          {/* Navigation row */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, { opacity: activeSlot.parcelIndex === 0 && items.indexOf(activeItem) === 0 ? 0.3 : 1 }]}
              onPress={() => {
                if (activeSlot.parcelIndex > 0) {
                  setActiveSlot({ productId: activeSlot.productId, parcelIndex: activeSlot.parcelIndex - 1 });
                } else {
                  const idx = items.indexOf(activeItem);
                  if (idx > 0) {
                    const prev = items[idx - 1];
                    setActiveSlot({ productId: prev.productId, parcelIndex: prev.quantity - 1 });
                  }
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.text} />
              <Text style={styles.navBtnText}>Prev</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                const w = inputValues[activeKey!] ?? (activeItem.fulfillment?.[activeSlot.parcelIndex] !== null && activeItem.fulfillment?.[activeSlot.parcelIndex] !== undefined ? String(activeItem.fulfillment?.[activeSlot.parcelIndex]) : null);
                const sn = serialValues[activeKey!] ?? (activeItem.serialNumbers?.[activeSlot.parcelIndex] || null);
                if (w || sn) submitFulfillment(activeSlot.productId, activeSlot.parcelIndex, w, sn);
              }}
              activeOpacity={0.85}
              disabled={!!saving}
            >
              {saving === activeKey ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => {
                if (activeSlot.parcelIndex < activeItem.quantity - 1) {
                  setActiveSlot({ productId: activeSlot.productId, parcelIndex: activeSlot.parcelIndex + 1 });
                } else {
                  const idx = items.indexOf(activeItem);
                  if (idx < items.length - 1) {
                    setActiveSlot({ productId: items[idx + 1].productId, parcelIndex: 0 });
                  }
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.navBtnText}>Next</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    minHeight: 90,
    justifyContent: 'center',
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  headerLabel: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 4 },
  headerProgressRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  headerProgress: { fontSize: 26, fontWeight: '800', color: Colors.text },
  headerProgressSlash: { fontSize: 20, fontWeight: '400', color: Colors.textSecondary },
  headerProgressLabel: { fontSize: 12, color: Colors.textSecondary, marginLeft: 2 },
  progressBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, borderWidth: 1 },
  progressBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, numberOfLines: 1 },
  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.brand, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
    justifyContent: 'center', marginTop: 4, minHeight: 40,
  },
  startBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13, numberOfLines: 1 },
  splitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#000', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 12,
    justifyContent: 'center', marginTop: 8, minHeight: 32,
  },
  splitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 11, numberOfLines: 1 },

  // Category
  itemsContainer: { flex: 1 },
  categorySection: { marginTop: Spacing.md, marginHorizontal: Spacing.sm },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  categoryName: { fontSize: 11, fontWeight: '700', color: Colors.text, flex: 1, numberOfLines: 1, marginRight: Spacing.xs },
  categoryMeta: { fontSize: 9, color: Colors.textSecondary, marginTop: 2, numberOfLines: 1 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 16, marginRight: 3 },
  catBadgeText: { fontSize: 10, fontWeight: '800', numberOfLines: 1 },

  // Variant row
  variantRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    marginTop: 6, marginHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  variantRowActive: { borderColor: Colors.brand, borderWidth: 2, backgroundColor: Colors.brand + '08' },
  variantLeft: { flex: 1, minWidth: 0 },
  variantSize: { fontSize: 13, fontWeight: '800', color: Colors.text, numberOfLines: 1 },
  snBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand + '18', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, gap: 1 },
  snBadgeText: { fontSize: 8, fontWeight: '700', color: Colors.brand, numberOfLines: 1 },

  // Parcel dots
  parcelDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  dot: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.bgSecondary, borderWidth: 1.5, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  dotDone: { backgroundColor: Colors.success + '20', borderColor: Colors.success },
  dotActive: { backgroundColor: Colors.brand + '25', borderColor: Colors.brand, borderWidth: 2.5 },
  dotWeightText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  dotEmptyText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  // Variant right actions
  variantRight: { alignItems: 'center', gap: 6, paddingLeft: 8, paddingTop: 2 },
  variantStatusDot: { width: 8, height: 8, borderRadius: 4 },
  variantStatusText: { fontSize: 11, fontWeight: '700' },
  enterBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.brand, justifyContent: 'center', alignItems: 'center',
  },

  // Summary
  summarySection: {
    margin: Spacing.sm, backgroundColor: Colors.surface,
    borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  summaryTitle: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: Spacing.xs },
  summaryCategory: { fontSize: 12, fontWeight: '600', color: Colors.text, flex: 1, numberOfLines: 1 },
  summaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 16, borderWidth: 1 },
  summaryValue: { fontSize: 12, fontWeight: '700', numberOfLines: 1 },
  summaryDetails: { flexDirection: 'row', gap: Spacing.md, marginBottom: 8, marginLeft: 0, paddingLeft: Spacing.xs },
  summaryRate: { fontSize: 11, fontWeight: '600', color: Colors.brand, backgroundColor: Colors.brand + '15', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  summaryWeight: { fontSize: 11, fontWeight: '600', color: Colors.success, backgroundColor: Colors.success + '15', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  doneBtn: {
    marginTop: 12, backgroundColor: Colors.brand, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', minHeight: 44,
  },
  doneBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, numberOfLines: 1 },

  // ── Bottom Entry Panel ──
  entryPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: 28,
    paddingTop: 10,
    borderTopWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 20,
  },
  panelHandle: {
    width: 36, height: 3, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 10,
  },
  panelScrollable: { maxHeight: 320, paddingHorizontal: 0 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flex: 1, paddingHorizontal: Spacing.lg },
  panelVariant: { fontSize: 18, fontWeight: '800', color: Colors.text, flex: 1, numberOfLines: 1 },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 1, justifyContent: 'space-between' },
  panelParcelLabel: { fontSize: 12, color: Colors.textSecondary, numberOfLines: 1 },
  panelRateText: { fontSize: 12, fontWeight: '700', color: Colors.brand, backgroundColor: Colors.brand + '15', paddingHorizontal: Spacing.xs, paddingVertical: 2, borderRadius: 4, numberOfLines: 1 },
  panelClose: { padding: 4 },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: Spacing.lg },
  savingText: { fontSize: 13, color: Colors.textSecondary },
  previousParcelsSection: { marginBottom: 10, marginHorizontal: Spacing.lg, maxHeight: 140, backgroundColor: Colors.bgSecondary, borderRadius: 8, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  previousParcelsTitle: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6, letterSpacing: 0.5 },
  previousParcelsScroll: { maxHeight: 120 },
  previousParcelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 4, paddingHorizontal: 4, backgroundColor: Colors.surface, borderRadius: 6, marginBottom: 4, borderWidth: 1, borderColor: Colors.border + '40' },
  previousParcelNum: { fontSize: 9, fontWeight: '800', color: Colors.brand, minWidth: 24, textAlign: 'center' },
  previousParcelDetails: { flex: 1 },
  previousParcelText: { fontSize: 9, fontWeight: '600', color: Colors.text, numberOfLines: 1 },
  previousParcelPlaceholder: { fontSize: 9, color: Colors.textSecondary, fontStyle: 'italic' },
  settingsRowPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, backgroundColor: Colors.brand + '08', marginHorizontal: Spacing.lg, paddingHorizontal: Spacing.md, marginBottom: 12, borderRadius: 8 },
  settingsRowPanelNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8, marginHorizontal: Spacing.lg, marginBottom: 10 },
  settingItemPanel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingItemPanelNarrow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0 },
  settingLabelPanel: { fontSize: 12, fontWeight: '600', color: Colors.text },
  delayButtonsRowPanel: { flexDirection: 'row', gap: 4 },
  delayButtonsRowPanelNarrow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  delayBtnPanel: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  delayBtnPanelActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  delayBtnTextPanel: { fontSize: 9, fontWeight: '600', color: Colors.text },
  delayBtnTextPanelActive: { color: '#fff' },

  // Inputs
  inputGroup: { marginBottom: 10, paddingHorizontal: Spacing.lg },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.text, numberOfLines: 1 },
  bigInput: {
    width: '100%', height: 50, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.bg, paddingHorizontal: 14,
    fontSize: 20, fontWeight: '700', color: Colors.text,
    textAlign: 'left',
  },
  smallInput: {
    width: '100%', height: 40, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.bg, paddingHorizontal: 12,
    fontSize: 14, fontWeight: '600', color: Colors.text,
    textAlign: 'left',
  },
  bigInputWeight: { textAlign: 'center', fontSize: 24 },
  bigInputFilled: { borderColor: Colors.brand, backgroundColor: Colors.brand + '08' },
  inputWithButton: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  clearBtn: { position: 'absolute', right: 12, padding: 8, justifyContent: 'center', alignItems: 'center' },

  // Nav
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: Spacing.lg },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border,
  },
  navBtnText: { fontSize: 12, fontWeight: '600', color: Colors.text, numberOfLines: 1 },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: 10, paddingVertical: 14, minHeight: 44,
  },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14, numberOfLines: 1 },
});
