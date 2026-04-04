import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Modal, FlatList, useWindowDimensions, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { SearchInput } from '../../src/components/SearchInput';
import { OrderFulfillment } from '../../src/components/OrderFulfillment';
import { useResponsive } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface GodownEntry { godown: string; readyParcels: number; }
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
interface Order {
  id: string; orderId: string; partyName: string; location: string; godown: string; message: string;
  totalParcels: number;
  godownDistribution: GodownEntry[]; readinessStatus: string;
  dispatched: boolean; dispatchedAt: string | null;
  dispatchNote?: string;
  billNo?: string; completed?: boolean; completedAt?: string | null;
  items?: OrderItem[];
  createdByName: string; createdAt: string; updatedAt: string;
}

function StatusToggle({ label, value, onToggle, icon }: { label: string; value: boolean; onToggle: () => void; icon: string }) {
  return (
    <TouchableOpacity
      testID={`toggle-${label.toLowerCase().replace(/\s/g, '-')}`}
      style={[styles.toggleRow, value && styles.toggleDone]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.toggleLeft}>
        <Ionicons name={icon as any} size={22} color={value ? Colors.success : Colors.textSecondary} />
        <Text style={[styles.toggleLabel, value && styles.toggleLabelDone]}>{label}</Text>
      </View>
      <View style={[styles.toggleIndicator, value && styles.toggleIndicatorDone]}>
        <Ionicons name={value ? 'checkmark' : 'close'} size={16} color={value ? '#FFF' : Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, wsMessage } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    console.log('Order detail screen - isAdmin:', isAdmin, 'user role:', user?.role);
  }, [isAdmin, user?.role]);
  const isAccountant = user?.role === 'accountant';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [billNo, setBillNo] = useState('');
  const [savingBill, setSavingBill] = useState(false);
  const [editingBill, setEditingBill] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editParty, setEditParty] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editGodown, setEditGodown] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editParcels, setEditParcels] = useState('');

  // Edit modal - category/variant selection
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [editCategoriesInOrder, setEditCategoriesInOrder] = useState<any[]>([]);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editCategorySearch, setEditCategorySearch] = useState('');
  const [editFilteredCategories, setEditFilteredCategories] = useState<string[]>([]);
  const [editCategoryRateInput, setEditCategoryRateInput] = useState('');
  const [showEditVariantModal, setShowEditVariantModal] = useState(false);
  const [editSelectedCategory, setEditSelectedCategory] = useState<string | null>(null);
  const [editSelectedCategoryRate, setEditSelectedCategoryRate] = useState('');
  const [editCategoryProducts, setEditCategoryProducts] = useState<any[]>([]);
  const [editVariantSearch, setEditVariantSearch] = useState('');
  const [editFilteredVariants, setEditFilteredVariants] = useState<any[]>([]);
  const [editVariantSelections, setEditVariantSelections] = useState<any[]>([]);
  const [categoryMetas, setCategoryMetas] = useState<Record<string, boolean>>({});

  const fetchOrder = useCallback(async () => {
    try {
      console.log('Fetching order with id:', id, 'type:', typeof id);
      const data = await api.get(`/orders/${id}`);
      console.log('Order fetched:', data.id, data.orderId);
      setOrder(data);
      setBillNo(data.billNo || '');
    } catch (e: any) {
      console.error('Error fetching order:', e);
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Also fetch categories and metas for editing
    try {
      const prodData = await api.get('/products');
      setAllProducts(prodData);
      const uniqueCats = Array.from(new Set(prodData.map((p: any) => p.category))).sort() as string[];
      setCategories(uniqueCats);
      setEditFilteredCategories(uniqueCats);
      
      const catMetas = await api.get('/products/categories');
      const map: Record<string, boolean> = {};
      for (const c of catMetas) { map[c.name] = c.requireSerialNo; }
      setCategoryMetas(map);
    } catch (_) {}
  }, [id]);

  const saveBillNo = async () => {
    if (!billNo.trim()) { Alert.alert('Error', 'Bill number is required'); return; }
    setSavingBill(true);
    try {
      const updated = await api.put(`/orders/${id}/bill`, { billNo: billNo.trim() });
      setOrder(updated);
      if (isAccountant) {
        Alert.alert('Success', 'Bill number saved');
        router.back();
      } else {
        Alert.alert('Success', 'Bill number saved');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingBill(false);
    }
  };

  const completeOrder = async () => {
    try {
      await api.put(`/orders/${id}/complete`, {});
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => { fetchOrder(); }, []);
  useEffect(() => {
    if (wsMessage?.type === 'ORDER_UPDATED' && wsMessage?.order?.id === id) {
      setOrder(wsMessage.order);
    }
    if (wsMessage?.type === 'ORDER_DELETED' && wsMessage?.orderId === id) {
      Alert.alert('Order Deleted', 'This order has been deleted');
      router.back();
    }
  }, [wsMessage]);

  // Refresh order when screen comes into focus (returning from other screens)
  useFocusEffect(
    useCallback(() => {
      fetchOrder();
    }, [fetchOrder])
  );


  const saveEdit = async () => {
    setActionLoading('edit');
    try {
      // Validate required fields
      if (!editParty.trim()) {
        Alert.alert('Missing Party Name', 'Please enter the party/customer name');
        setActionLoading('');
        return;
      }
      if (!editLocation.trim()) {
        Alert.alert('Missing Location', 'Please enter the location/address');
        setActionLoading('');
        return;
      }
      if (!editGodown) {
        Alert.alert('Missing Gowdown', 'Please select which gowdown (Sundha or Lal-Shivnagar)');
        setActionLoading('');
        return;
      }

      const body: any = {};
      if (editParty !== order?.partyName) body.partyName = editParty;
      if (editLocation !== order?.location) body.location = editLocation;
      if (editGodown !== order?.godown) body.godown = editGodown;
      if (editMessage !== order?.message) body.message = editMessage;

      // Include items - always send if categories exist
      if (editCategoriesInOrder.length > 0) {
        const allItems = editCategoriesInOrder.flatMap((c: any) => c.items);
        body.items = allItems;
        // Auto-calculate totalParcels from items
        const calculatedTotalParcels = allItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
        body.totalParcels = calculatedTotalParcels;
      } else if (parseInt(editParcels) !== order?.totalParcels) {
        body.totalParcels = parseInt(editParcels);
      }

      if (Object.keys(body).length === 0) {
        Alert.alert('Info', 'No changes made');
        setShowEdit(false);
        return;
      }

      const data = await api.put(`/orders/${id}`, body);
      setOrder(data);
      setShowEdit(false);
      Alert.alert('Success', 'Order updated successfully');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(''); }
  };

  const handleEditAddCategory = () => {
    setEditCategorySearch('');
    setEditCategoryRateInput('');
    setEditFilteredCategories(categories);
    setShowEditCategoryModal(true);
  };

  const handleEditSelectCategory = (cat: string) => {
    // Validate category rate if provided
    if (editCategoryRateInput.trim()) {
      const rateNum = parseFloat(editCategoryRateInput);
      if (isNaN(rateNum) || rateNum <= 0) {
        Alert.alert('Invalid Category Rate', 'Category rate must be a valid number greater than 0');
        return;
      }
    }

    setEditSelectedCategory(cat);
    setEditSelectedCategoryRate(editCategoryRateInput);
    const products = allProducts.filter((p: any) => p.category === cat).sort((a: any, b: any) => a.size.localeCompare(b.size));
    setEditCategoryProducts(products);
    setEditFilteredVariants(products);

    const existingCategory = editCategoriesInOrder.find(c => c.category === cat);

    const initialSelections = products.map((p: any) => {
      const existingItem = existingCategory?.items.find((i: any) => i.productId === p.id);
      return {
        productId: p.id,
        size: p.size,
        quantity: existingItem ? String(existingItem.quantity) : '',
        rate: existingItem ? String(existingItem.rate || '') : editCategoryRateInput,
        selected: !!existingItem,
      };
    });
    setEditVariantSelections(initialSelections);

    setEditVariantSearch('');
    setEditCategoryRateInput('');
    setShowEditCategoryModal(false);
    setShowEditVariantModal(true);
  };

  const handleEditVariantSearch = (text: string) => {
    setEditVariantSearch(text);
    const filtered = editCategoryProducts.filter((p: any) =>
      p.size.toLowerCase().includes(text.toLowerCase()) ||
      p.alias.toLowerCase().includes(text.toLowerCase())
    );

    const filtered_ids = filtered.map((f: any) => f.id);
    setEditVariantSelections((prev: any) =>
      prev.map((v: any) => ({
        ...v,
        selected: filtered_ids.includes(v.productId) && v.selected,
      }))
    );
    setEditFilteredVariants(filtered);
  };

  const toggleEditVariantSelection = (productId: string) => {
    setEditVariantSelections((prev: any) =>
      prev.map((v: any) =>
        v.productId === productId
          ? { ...v, selected: !v.selected }
          : v
      )
    );
  };

  const updateEditVariantField = (productId: string, field: 'quantity' | 'rate', value: string) => {
    setEditVariantSelections((prev: any) =>
      prev.map((v: any) =>
        v.productId === productId
          ? { ...v, [field]: value }
          : v
      )
    );
  };

  const handleEditAddVariants = () => {
    const selectedVariants = editVariantSelections.filter((v: any) => v.selected);

    if (selectedVariants.length === 0) {
      Alert.alert('Error', 'Please select at least one variant');
      return;
    }

    // Validate each selected variant
    for (const variant of selectedVariants) {
      const product = editCategoryProducts.find((p: any) => p.id === variant.productId);

      // Check quantity
      if (!variant.quantity.trim()) {
        Alert.alert('Missing Quantity', `Please enter quantity for ${product?.size}`);
        return;
      }

      const qtyNum = parseInt(variant.quantity);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        Alert.alert('Invalid Quantity', `Quantity for ${product?.size} must be a number greater than 0`);
        return;
      }

      // Check rate if no category rate is set
      if (!editSelectedCategoryRate) {
        if (!variant.rate.trim()) {
          Alert.alert('Missing Rate', `Please enter rate for ${product?.size}`);
          return;
        }

        const rateNum = parseFloat(variant.rate);
        if (isNaN(rateNum) || rateNum <= 0) {
          Alert.alert('Invalid Rate', `Rate for ${product?.size} must be a valid number greater than 0`);
          return;
        }
      }
    }

    const newItems: any[] = selectedVariants.map((selection: any) => {
      const product = editCategoryProducts.find((p: any) => p.id === selection.productId)!;
      return {
        productId: product.id,
        alias: product.alias,
        category: product.category,
        size: product.size,
        printName: product.printName,
        quantity: parseInt(selection.quantity),
        rate: editSelectedCategoryRate || selection.rate,
        requireSerialNo: categoryMetas[editSelectedCategory || ''] ?? false,
      };
    });

    setEditCategoriesInOrder((prev: any) => {
      const existing = prev.find((c: any) => c.category === editSelectedCategory);
      if (existing) {
        return prev.map((c: any) =>
          c.category === editSelectedCategory
            ? { ...c, categoryRate: editSelectedCategoryRate || c.categoryRate, items: newItems }
            : c
        );
      } else {
        return [...prev, { category: editSelectedCategory!, categoryRate: editSelectedCategoryRate, items: newItems }];
      }
    });

    handleEditCloseVariantModal();
  };

  const handleEditCloseVariantModal = () => {
    setShowEditVariantModal(false);
    setEditSelectedCategory(null);
    setEditSelectedCategoryRate('');
    setEditVariantSelections([]);
    setEditCategoryProducts([]);
  };

  const handleEditItemUpdate = (categoryName: string, productId: string, field: 'quantity' | 'rate', value: string) => {
    setEditCategoriesInOrder((prev: any) =>
      prev.map((c: any) =>
        c.category === categoryName
          ? {
              ...c,
              items: c.items.map((i: any) =>
                i.productId === productId
                  ? { ...i, [field]: field === 'quantity' ? (parseInt(value) || 0) : value }
                  : i
              ),
            }
          : c
      )
    );
  };

  const handleEditRemoveVariant = (categoryName: string, productId: string) => {
    setEditCategoriesInOrder((prev: any) =>
      prev
        .map((c: any) =>
          c.category === categoryName
            ? { ...c, items: c.items.filter((i: any) => i.productId !== productId) }
            : c
        )
        .filter((c: any) => c.items.length > 0)
    );
  };

  const handleEditRemoveCategory = (categoryName: string) => {
    setEditCategoriesInOrder((prev: any) =>
      prev.filter((c: any) => c.category !== categoryName)
    );
  };

  const deleteOrder = () => {
    console.log('Delete button clicked, order id:', id);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    console.log('🗑️ Starting delete for order:', id);
    setIsDeleting(true);
    try {
      console.log('Sending DELETE request for order:', id);
      const response = await api.del(`/orders/${id}`);
      console.log('✅ Delete response:', response);
      setShowDeleteConfirm(false);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      console.error('❌ Delete failed:', e);
      setShowDeleteConfirm(false);
      Alert.alert('Error', e.message || 'Failed to delete order');
    } finally {
      setIsDeleting(false);
    }
  };

  const openEdit = async () => {
    if (order) {
      setEditParty(order.partyName);
      setEditLocation(order.location);
      setEditGodown(order.godown || '');
      setEditMessage(order.message);
      setEditParcels(String(order.totalParcels));

      // Initialize categories in order from existing items
      if (order.items && order.items.length > 0) {
        const grouped: any[] = [];
        const categoryMap: { [key: string]: any } = {};

        order.items.forEach((item: OrderItem) => {
          if (!categoryMap[item.category]) {
            categoryMap[item.category] = {
              category: item.category,
              categoryRate: item.rate || '',
              items: []
            };
          }
          categoryMap[item.category].items.push(item);
        });

        setEditCategoriesInOrder(Object.values(categoryMap));
      } else {
        setEditCategoriesInOrder([]);
      }

      // Fetch products if not already loaded
      if (allProducts.length === 0) {
        try {
          const productsData = await api.get('/products');
          setAllProducts(productsData);
          const uniqueCategories = Array.from(new Set(productsData.map((p: any) => p.category))).sort() as string[];
          setCategories(uniqueCategories);
          setEditFilteredCategories(uniqueCategories);
        } catch (e: any) {
          console.error('Error fetching products:', e);
        }
      }

      setShowEdit(true);
    }
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const totalReady = order.godownDistribution.reduce((s, g) => s + g.readyParcels, 0);
  const remaining = order.totalParcels - totalReady;
  const readyPercent = order.totalParcels > 0 ? (totalReady / order.totalParcels) * 100 : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{order.orderId}</Text>
        <View style={styles.headerActions}>
          {isAdmin && (
            <>
              <TouchableOpacity testID="edit-order-btn" onPress={openEdit} activeOpacity={0.7}>
                <Ionicons name="create-outline" size={22} color={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity testID="delete-order-btn" onPress={deleteOrder} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={22} color={Colors.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* STAFF FULFILLMENT VIEW */}
        {!isAdmin && !isAccountant ? (
          <View style={{ flex: 1 }}>
            {/* Compact Order Header */}
            <View style={styles.compactHeader}>
              <View style={styles.compactHeaderLeft}>
                <Text style={styles.compactPartyName}>{order.partyName}</Text>
                <Text style={styles.compactLocation}>{order.location}</Text>
              </View>
              <View style={[styles.compactStatusBadge, { backgroundColor: (order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Completed' ? Colors.success : order.readinessStatus === 'Ready' ? Colors.info : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger) + '18' }]}>
                <Text style={[styles.compactStatusText, { color: order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Completed' ? Colors.success : order.readinessStatus === 'Ready' ? Colors.info : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger }]}>
                  {order.dispatched ? 'DISPATCHED' : order.readinessStatus.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Message Collapsible */}
            {order.message && (
              <View style={styles.compactMessage}>
                <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.compactMessageText} numberOfLines={1}>{order.message}</Text>
              </View>
            )}

            {/* Fulfillment Component */}
            {order.items && order.items.length > 0 && (
              <OrderFulfillment
                items={order.items}
                orderId={order.id}
                totalParcels={order.totalParcels}
                onUpdate={(updatedItems) => {
                  // Update order items immediately from API response
                  setOrder(prev => prev ? { ...prev, items: updatedItems } : null);
                }}
                isAdmin={isAdmin}
              />
            )}
          </View>
        ) : (
          /* ADMIN / ACCOUNTANT VIEW */
          <ScrollView
            style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrder(); }} tintColor={Colors.brand} />}
          >
            {/* Order Info */}
            <View style={styles.section}>
              <Text style={styles.partyName}>{order.partyName}</Text>
              <Text style={styles.locationText}>{order.location}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (order.readinessStatus === 'Bill Generated' ? '#8B5CF6' : order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Completed' ? Colors.success : order.readinessStatus === 'Ready' ? Colors.info : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger) + '18' }]}>
                <Text style={[styles.statusBadgeText, { color: order.readinessStatus === 'Bill Generated' ? '#8B5CF6' : order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Completed' ? Colors.success : order.readinessStatus === 'Ready' ? Colors.info : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger }]}>
                  {order.readinessStatus === 'Completed' ? 'COMPLETED' : order.readinessStatus === 'Bill Generated' ? 'BILL GENERATED' : order.dispatched ? 'DISPATCHED' : order.readinessStatus.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Message */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ORDER MESSAGE</Text>
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>{order.message}</Text>
              </View>
            </View>

          {/* Items - Grouped by Category */}
          {order.items && order.items.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SELECTED PRODUCTS</Text>
              {(() => {
                const groupedByCategory = order.items.reduce((acc: { [key: string]: typeof order.items }, item) => {
                  if (!acc[item.category]) {
                    acc[item.category] = [];
                  }
                  acc[item.category].push(item);
                  return acc;
                }, {});

                return Object.entries(groupedByCategory).map(([category, items]) => {
                  return (
                    <View key={category} style={styles.categoryCard}>
                      <TouchableOpacity
                        style={styles.categoryHeader}
                        onPress={() => (isAdmin || isAccountant) && router.push(`/order/${id}/view-category/${category}`)}
                        disabled={!isAdmin && !isAccountant}
                        activeOpacity={(isAdmin || isAccountant) ? 0.7 : 1}
                      >
                        <Text style={styles.categoryName}>{category}</Text>
                        {(isAdmin || isAccountant) && (
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={Colors.brand}
                          />
                        )}
                      </TouchableOpacity>

                      {/* Variants List View */}
                      <View style={styles.variantsList}>
                        {/* Headers */}
                        <View style={[styles.variantItem, { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, borderRadius: 0 }]}>
                          <Text style={[styles.variantSize, { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' }]} numberOfLines={1}>SIZE</Text>
                          {order.dispatched && (isAdmin || isAccountant) ? (
                            <>
                              <Text style={[{ flex: 0.6, textAlign: 'center', color: Colors.textSecondary, fontSize: 11, fontWeight: '700' }]} numberOfLines={1}>QTY</Text>
                              <Text style={[{ flex: 1.2, textAlign: 'center', color: Colors.textSecondary, fontSize: 11, fontWeight: '700' }]} numberOfLines={1}>WEIGHT</Text>
                            </>
                          ) : (
                            <Text style={[{ flex: 0.8, textAlign: 'center', color: Colors.textSecondary, fontSize: 11, fontWeight: '700' }]} numberOfLines={1}>QTY</Text>
                          )}
                          <Text style={[styles.variantRate, { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' }]} numberOfLines={1}>RATE</Text>
                        </View>
                        {items.map((item, idx) => {
                          const fulfilledQty = (item.fulfillment || []).filter((w: any) => w !== null && w !== undefined).length;
                          const totalWeight = (item.fulfillment || []).reduce((sum: number, w: any) => sum + (w || 0), 0).toFixed(2);
                          return (
                            <View key={idx} style={styles.variantItem}>
                              <Text style={styles.variantSize} numberOfLines={1}>{item.size}</Text>
                              {order.dispatched && (isAdmin || isAccountant) ? (
                                <>
                                  <Text style={{ flex: 0.6, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }} numberOfLines={1}>{fulfilledQty}</Text>
                                  <Text style={{ flex: 1.2, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '700', color: Colors.success }} numberOfLines={1}>{totalWeight}kg</Text>
                                </>
                              ) : (
                                <Text style={{ flex: 0.8, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }} numberOfLines={1}>{item.quantity}</Text>
                              )}
                              {item.rate && <Text style={styles.variantRate} numberOfLines={1}>₹{item.rate}</Text>}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          )}



          {/* Dispatch Note - visible to admin and accountant */}
          {order.dispatchNote && (isAdmin || isAccountant) && (
             <View style={styles.section}>
               <Text style={styles.sectionLabel}>DISPATCH NOTE</Text>
               <View style={styles.messageBox}>
                 <Text style={styles.messageText}>{order.dispatchNote}</Text>
               </View>
             </View>
          )}

          {/* Bill No Section - for dispatched orders, visible to admin and accountant */}
          {order.dispatched && (isAdmin || isAccountant) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>BILL NUMBER</Text>
              {order.billNo && !editingBill ? (
                <View style={styles.billRow}>
                  <View style={styles.billDisplay}>
                    <Text style={styles.billDisplayText}>{order.billNo}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.billEditBtn}
                    onPress={() => { setBillNo(order.billNo || ''); setEditingBill(true); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={18} color="#FFF" />
                    <Text style={styles.billSaveBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.billRow}>
                  <TextInput
                    style={styles.billInput}
                    value={billNo}
                    onChangeText={setBillNo}
                    placeholder="Enter bill number"
                    placeholderTextColor={Colors.textSecondary}
                    autoFocus={editingBill}
                  />
                  <TouchableOpacity
                    style={[styles.billSaveBtn, savingBill && { opacity: 0.6 }]}
                    onPress={() => { saveBillNo(); setEditingBill(false); }}
                    disabled={savingBill}
                    activeOpacity={0.7}
                  >
                    {savingBill ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.billSaveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Complete Order - admin only, dispatched orders with bill no */}
          {isAdmin && order.dispatched && order.billNo && !order.completed && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.completeBtn} onPress={completeOrder} activeOpacity={0.7}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={styles.completeBtnText}>Complete Order</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Meta */}
            <View style={styles.meta}>
              <Text style={styles.metaText}>Created by {order.createdByName}</Text>
              <Text style={styles.metaText}>{new Date(order.createdAt).toLocaleString()}</Text>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Edit Modal */}
      <Modal visible={showEdit} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Edit Order</Text>
              <TouchableOpacity testID="edit-close-icon-btn" onPress={() => setShowEdit(false)} activeOpacity={0.7} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>PARTY NAME</Text>
            <TextInput testID="edit-party-input" style={styles.modalInput} value={editParty} onChangeText={setEditParty} />
            <Text style={styles.modalLabel}>LOCATION</Text>
            <TextInput testID="edit-location-input" style={styles.modalInput} value={editLocation} onChangeText={setEditLocation} />
            <Text style={styles.modalLabel}>GOWDOWN</Text>
            <View style={styles.gowdownBoxes}>
              <TouchableOpacity
                testID="edit-gowdown-sundha"
                style={[styles.gowdownBox, editGodown === 'Sundha' && styles.gowdownBoxSelected]}
                onPress={() => setEditGodown('Sundha')}
                activeOpacity={0.7}
              >
                <Ionicons name="home" size={16} color={editGodown === 'Sundha' ? Colors.brand : Colors.text} />
                <Text style={[styles.gowdownBoxText, editGodown === 'Sundha' && styles.gowdownBoxTextSelected]}>Sundha</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="edit-gowdown-lal-shivnagar"
                style={[styles.gowdownBox, editGodown === 'Lal-Shivnagar' && styles.gowdownBoxSelected]}
                onPress={() => setEditGodown('Lal-Shivnagar')}
                activeOpacity={0.7}
              >
                <Ionicons name="storefront" size={16} color={editGodown === 'Lal-Shivnagar' ? Colors.brand : Colors.text} />
                <Text style={[styles.gowdownBoxText, editGodown === 'Lal-Shivnagar' && styles.gowdownBoxTextSelected]}>Lal-Shiv</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>CATEGORIES IN ORDER</Text>
            {editCategoriesInOrder.length === 0 ? (
              <Text style={styles.emptyText}>No categories added yet</Text>
            ) : (
              editCategoriesInOrder.map((catInOrder, catIdx) => (
                <View key={catIdx} style={styles.categoryCard}>
                  <View style={styles.categoryCardHeader}>
                    <View>
                      <Text style={styles.categoryName}>{catInOrder.category}</Text>
                      {catInOrder.categoryRate && <Text style={styles.categoryRateTag}>Rate: ₹{catInOrder.categoryRate}</Text>}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleEditRemoveCategory(catInOrder.category)}
                      style={styles.removeCategoryBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.variantsList}>
                    {catInOrder.items.map((item: OrderItem, idx: number) => (
                      <View key={idx} style={styles.variantItemRow}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.variantSize, { flex: 1 }]}>{item.size}</Text>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, width: 45, height: 32, fontSize: 13, backgroundColor: Colors.bg, color: Colors.text, textAlign: 'center' }}
                            value={String(item.quantity || '')}
                            onChangeText={(val) => handleEditItemUpdate(catInOrder.category, item.productId, 'quantity', val)}
                            keyboardType="number-pad"
                            placeholder="Qty"
                          />
                          <TextInput
                            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 6, width: 55, height: 32, fontSize: 13, backgroundColor: Colors.bg, color: Colors.text, textAlign: 'center' }}
                            value={String(item.rate || '')}
                            onChangeText={(val) => handleEditItemUpdate(catInOrder.category, item.productId, 'rate', val)}
                            keyboardType="decimal-pad"
                            placeholder="Rate"
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => handleEditRemoveVariant(catInOrder.category, item.productId)}
                          style={{ padding: 4 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity
              style={styles.addCategoryBtn}
              onPress={handleEditAddCategory}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
              <Text style={styles.addCategoryText}>Add Category</Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>MESSAGE</Text>
            <TextInput testID="edit-message-input" style={[styles.modalInput, { height: 100 }]} value={editMessage} onChangeText={setEditMessage} multiline textAlignVertical="top" />
            <Text style={styles.modalLabel}>TOTAL PARCELS</Text>
            <TextInput testID="edit-parcels-input" style={styles.modalInput} value={editParcels} onChangeText={setEditParcels} keyboardType="number-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="edit-cancel-btn" style={styles.cancelBtn} onPress={() => setShowEdit(false)} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="edit-save-btn" style={styles.saveBtn} onPress={saveEdit} disabled={actionLoading === 'edit'} activeOpacity={0.7}>
                {actionLoading === 'edit' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Category Selection Modal */}
      <Modal visible={showEditCategoryModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeaderContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowEditCategoryModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <SearchInput
              placeholder="Search categories..."
              value={editCategorySearch}
              onChangeText={(text: string) => {
                setEditCategorySearch(text);
                setEditFilteredCategories(
                  categories.filter(c => c.toLowerCase().includes(text.toLowerCase()))
                );
              }}
            />

            <View style={styles.categoryRateInputSection}>
              <View style={styles.rateInputHeader}>
                <Ionicons name="pricetag" size={16} color={Colors.brand} />
                <Text style={styles.categoryRateInputLabel}>Set Rate for This Category (Optional)</Text>
              </View>
              <Text style={styles.categoryRateInputHint}>This rate will auto-fill all variants of this category</Text>
              <TextInput
                style={styles.categoryRateInputField}
                placeholder="e.g. 100"
                placeholderTextColor={Colors.textSecondary}
                value={editCategoryRateInput}
                onChangeText={setEditCategoryRateInput}
                keyboardType="decimal-pad"
              />
            </View>

            <FlatList
              data={editFilteredCategories}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <View style={styles.categoryOptionRow}>
                  <TouchableOpacity
                    style={styles.categoryOption}
                    onPress={() => handleEditSelectCategory(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryOptionText}>{item}</Text>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              scrollEnabled
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Variant Selection Modal */}
      <Modal visible={showEditVariantModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeaderContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editSelectedCategory}</Text>
              <TouchableOpacity onPress={handleEditCloseVariantModal} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {editSelectedCategoryRate && (
              <View style={styles.categoryRateBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.brand} />
                  <Text style={styles.categoryRateLabel}>Category Rate: ₹{editSelectedCategoryRate}</Text>
                </View>
                <Text style={styles.categoryRateNote}>Auto-filled for all variants (editable)</Text>
              </View>
            )}
            {!editSelectedCategoryRate && (
              <View style={styles.rateRequiredBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.warning} />
                <Text style={styles.rateRequiredText}>Enter rate for each variant</Text>
              </View>
            )}

            <SearchInput
              placeholder="Search variants..."
              value={editVariantSearch}
              onChangeText={handleEditVariantSearch}
            />

            <Text style={styles.subLabel}>SELECT VARIANTS & ENTER QUANTITY</Text>
            <FlatList
              data={editFilteredVariants}
              keyExtractor={item => item.id}
              scrollEnabled
              renderItem={({ item }) => {
                const selection = editVariantSelections.find((v: any) => v.productId === item.id);
                return (
                  <View style={styles.variantCheckRow}>
                    <TouchableOpacity
                      style={styles.checkboxArea}
                      onPress={() => toggleEditVariantSelection(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, selection?.selected && styles.checkboxChecked]}>
                        {selection?.selected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                      </View>
                      <Text style={styles.variantLabel}>{item.size}</Text>
                    </TouchableOpacity>

                    {selection?.selected && (
                      <View style={styles.inputRow}>
                        <TextInput
                          style={[styles.smallInput, styles.qtyInput]}
                          placeholder="Qty"
                          placeholderTextColor={Colors.textSecondary}
                          value={selection.quantity}
                          onChangeText={(val) => updateEditVariantField(item.id, 'quantity', val)}
                          keyboardType="number-pad"
                        />
                        <TextInput
                          style={[styles.smallInput, styles.rateInput, editSelectedCategoryRate && styles.rateInputAuto]}
                          placeholder="Rate"
                          placeholderTextColor={Colors.textSecondary}
                          value={selection.rate}
                          onChangeText={(val) => updateEditVariantField(item.id, 'rate', val)}
                          keyboardType="decimal-pad"
                          editable={true}
                        />
                      </View>
                    )}
                  </View>
                );
              }}
            />

            <TouchableOpacity
              style={styles.addVariantsBtn}
              onPress={handleEditAddVariants}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={20} color={Colors.textInverse} />
              <Text style={styles.addVariantsText}>Add All Selected</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: Colors.bg, borderRadius: 12, padding: Spacing.lg, width: '85%', maxWidth: 350 }}>
            <Text style={{ fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md }}>Delete Order?</Text>
            <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg }}>This action cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: Colors.border, paddingVertical: Spacing.md, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                <Text style={{ fontSize: FontSize.md, fontWeight: '600', color: Colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: Colors.danger, paddingVertical: Spacing.md, borderRadius: 8, justifyContent: 'center', alignItems: 'center', opacity: isDeleting ? 0.6 : 1 }}
                onPress={performDelete}
                disabled={isDeleting}
              >
                <Text style={{ fontSize: FontSize.md, fontWeight: '600', color: '#fff' }}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  headerActions: { flexDirection: 'row', gap: Spacing.lg },
  scroll: { flex: 1 },
  section: { padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  partyName: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text },
  locationText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginTop: Spacing.sm },
  statusBadgeText: { fontSize: FontSize.md, fontWeight: '700', letterSpacing: 0.5 },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  messageBox: { backgroundColor: Colors.bgSecondary, borderRadius: 8, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  messageText: { fontSize: FontSize.md, color: Colors.text, lineHeight: 22 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.sm, minHeight: 56 },
  toggleDone: { borderColor: Colors.success + '40', backgroundColor: Colors.success + '08' },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  toggleLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  toggleLabelDone: { color: Colors.success },
  toggleIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgSecondary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  toggleIndicatorDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  addGodownBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  addGodownText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '600' },
  progressWrap: { marginBottom: Spacing.lg },
  progressBar: { height: 8, backgroundColor: Colors.bgSecondary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  godownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.sm },
  godownLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  godownName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  godownParcels: { fontSize: FontSize.md, fontWeight: '700', color: Colors.brand },
  emptyGodown: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.lg },
  pendingBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warning + '12', borderRadius: 8, padding: Spacing.md, marginTop: Spacing.sm },
  pendingText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '600' },
  meta: { padding: Spacing.xl, alignItems: 'center' },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: Spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xl },
  modalLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.md },
  modalInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 48, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: { flex: 1, backgroundColor: Colors.brand, borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textInverse },
  // Category Items
  categoryCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.md },
  categoryName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  variantsList: { gap: Spacing.sm },
  variantItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgSecondary, borderRadius: 6, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, gap: Spacing.sm },
  variantSize: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, flex: 0.8 },
  variantRate: { fontSize: FontSize.sm, color: Colors.brand, fontWeight: '700', flex: 0.6, textAlign: 'right' },
  variantQtyCenter: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, textAlign: 'center', minWidth: 50 },
  // Gowdown Boxes in Modal
  gowdownBoxes: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  gowdownBox: { flex: 1, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border, borderRadius: 12, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: Spacing.xs },
  gowdownBoxSelected: { borderColor: Colors.brand, borderWidth: 2, backgroundColor: Colors.brand + '08' },
  gowdownBoxText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  gowdownBoxTextSelected: { color: Colors.brand, fontWeight: '700' },
  // Category Modal Styles
  categoryRateInputSection: { backgroundColor: Colors.brand + '08', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.brand + '20' },
  rateInputHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryRateInputLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  categoryRateInputHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  categoryRateInputField: { borderWidth: 1, borderColor: Colors.brand, borderRadius: 10, paddingHorizontal: Spacing.md, height: 44, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  categoryOptionRow: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  categoryOptionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  categoryRateBox: { backgroundColor: Colors.brand + '10', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: Colors.brand },
  categoryRateLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand, flex: 1 },
  categoryRateNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs, marginLeft: Spacing.lg },
  rateRequiredBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning + '10', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.warning },
  rateRequiredText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '600', flex: 1 },
  subLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm },
  variantCheckRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  checkboxArea: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  variantLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  inputRow: { flexDirection: 'row', gap: Spacing.sm },
  smallInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: Spacing.sm, height: 36, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg },
  qtyInput: { width: 50 },
  rateInput: { width: 60 },
  rateInputAuto: { backgroundColor: Colors.brand + '08', borderColor: Colors.brand },
  addVariantsBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.lg },
  addVariantsText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  addCategoryBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.lg },
  addCategoryText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  // Modal styles - EXACT replica from create.tsx
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalHeaderContent: { flex: 1, backgroundColor: Colors.bg, marginTop: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  categoryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  removeCategoryBtn: { padding: Spacing.xs },
  removeVariantBtn: { paddingLeft: Spacing.sm },
  variantItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgSecondary, borderRadius: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.md },
  variantItemInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', paddingVertical: Spacing.lg },
  categoryRateTag: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '700', marginTop: Spacing.xs, marginBottom: Spacing.md, backgroundColor: Colors.brand + '15', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: 4, alignSelf: 'flex-start' },

  // Compact Staff View Header
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  compactHeaderLeft: { flex: 1 },
  compactPartyName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  compactLocation: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs, fontWeight: '500' },
  compactStatusBadge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  compactStatusText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  compactMessage: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  compactMessageText: { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1 },

  // Table View Styles for Admin
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  tableViewContainer: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
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
    backgroundColor: Colors.surface,
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
    marginLeft: Spacing.xs,
  },
  statusBadgeTextSmall: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  // Bill No Section
  billRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  billInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 48, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  billSaveBtn: { backgroundColor: Colors.brand, borderRadius: 8, height: 48, paddingHorizontal: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  billEditBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 8, height: 48, paddingHorizontal: Spacing.xl, justifyContent: 'center', alignItems: 'center', gap: Spacing.xs },
  billSaveBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  billDisplay: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 48, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  billDisplayText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  // Complete Order
  completeBtn: { flexDirection: 'row', backgroundColor: Colors.success, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  completeBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
