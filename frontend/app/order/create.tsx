import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, FlatList, useWindowDimensions, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/utils/api';
import { SearchInput } from '../../src/components/SearchInput';
import { useResponsive } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Product {
  id: string;
  category: string;
  size: string;
  printName: string;
  alias: string;
}

interface SelectedItem {
  productId: string;
  alias: string;
  category: string;
  size: string;
  printName: string;
  quantity: number;
  rate: string;
  requireSerialNo?: boolean;
}

interface CategoryInOrder {
  category: string;
  categoryRate: string;
  items: SelectedItem[];
}

interface VariantSelection {
  productId: string;
  size: string;
  quantity: string;
  rate: string;
  selected: boolean;
}

interface Gowdown {
  id: string;
  name: string;
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const rateInputRefs = useRef<Record<string, any>>({});
  const autoAdvanceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const { width } = useWindowDimensions();
  const isNarrow = width < 420;

  const [enableAutoAdvance, setEnableAutoAdvance] = useState(true);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(2000); // 2 seconds default

  const [partyName, setPartyName] = useState('');
  const [location, setLocation] = useState('');
  const [godown, setGodown] = useState('');
  const [message, setMessage] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [gowdowns, setGowdowns] = useState<Gowdown[]>([]);
  const [categoriesInOrder, setCategoriesInOrder] = useState<CategoryInOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Category selection modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [filteredCategories, setFilteredCategories] = useState<string[]>([]);
  const [categoryRateInput, setCategoryRateInput] = useState('');
  const [categoryMetas, setCategoryMetas] = useState<Record<string, boolean>>({});

  // Variant selection modal
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategoryRate, setSelectedCategoryRate] = useState('');
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [filteredVariants, setFilteredVariants] = useState<Product[]>([]);
  const [variantSelections, setVariantSelections] = useState<VariantSelection[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Cleanup auto-advance timers on unmount
  useEffect(() => {
    return () => {
      Object.values(autoAdvanceTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const [productsData, gowdownsData] = await Promise.all([
        api.get('/products'),
        api.get('/gowdowns'),
      ]);
      setAllProducts(productsData);
      const uniqueCategories = Array.from(new Set(productsData.map((p: Product) => p.category))).sort() as string[];
      setCategories(uniqueCategories);
      setFilteredCategories(uniqueCategories);
      console.log('📦 Gowdowns fetched:', gowdownsData);
      setGowdowns(gowdownsData);
      // Fetch category metadata (requireSerialNo)
      try {
        const catMetas = await api.get('/products/categories');
        const map: Record<string, boolean> = {};
        for (const c of catMetas) { map[c.name] = c.requireSerialNo; }
        setCategoryMetas(map);
      } catch (_) {}
    } catch (e: any) {
      console.error('❌ Error fetching data:', e);
      Alert.alert('Error', e.message);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleAddCategory = () => {
    setCategorySearch('');
    setCategoryRateInput('');
    setFilteredCategories(categories);
    setShowCategoryModal(true);
  };

  const handleSelectCategory = (cat: string) => {
    // Validate category rate if provided
    if (categoryRateInput.trim()) {
      const rateNum = parseFloat(categoryRateInput);
      if (isNaN(rateNum) || rateNum <= 0) {
        Alert.alert('Invalid Category Rate', 'Category rate must be a valid number greater than 0');
        return;
      }
    }

    setSelectedCategory(cat);
    setSelectedCategoryRate(categoryRateInput);
    const products = allProducts.filter(p => p.category === cat).sort((a, b) => a.size.localeCompare(b.size));
    setCategoryProducts(products);
    setFilteredVariants(products);

    // Initialize variant selections with existing filled values if present
    const existingCategory = categoriesInOrder.find(c => c.category === cat);
    const initialSelections = products.map(p => {
      const existingItem = existingCategory?.items.find((i: any) => i.productId === p.id);
      return {
        productId: p.id,
        size: p.size,
        quantity: existingItem ? String(existingItem.quantity) : '',
        rate: existingItem ? String(existingItem.rate || '') : categoryRateInput,
        selected: !!existingItem,
      };
    });
    setVariantSelections(initialSelections);

    setVariantSearch('');
    setCategoryRateInput(''); // Clear rate input for next category
    setShowCategoryModal(false);
    setShowVariantModal(true);
  };

  const handleVariantSearch = (text: string) => {
    setVariantSearch(text);
    const filtered = categoryProducts.filter(p =>
      p.size.toLowerCase().includes(text.toLowerCase()) ||
      p.alias.toLowerCase().includes(text.toLowerCase())
    );

    const filtered_ids = filtered.map(f => f.id);
    setVariantSelections(prev =>
      prev.map(v => ({
        ...v,
        selected: filtered_ids.includes(v.productId) && v.selected,
      }))
    );
    setFilteredVariants(filtered);
  };

  const toggleVariantSelection = (productId: string) => {
    setVariantSelections(prev =>
      prev.map(v =>
        v.productId === productId
          ? { ...v, selected: !v.selected }
          : v
      )
    );
  };

  const updateVariantField = (productId: string, field: 'quantity' | 'rate', value: string) => {
    setVariantSelections(prev =>
      prev.map(v =>
        v.productId === productId
          ? { ...v, [field]: value }
          : v
      )
    );
  };

  const handleAddVariants = () => {
    const selectedVariants = variantSelections.filter(v => v.selected);

    if (selectedVariants.length === 0) {
      Alert.alert('Error', 'Please select at least one variant');
      return;
    }

    // Validate each selected variant
    for (const variant of selectedVariants) {
      const product = categoryProducts.find(p => p.id === variant.productId);

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
      if (!selectedCategoryRate) {
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

    // Create items from selected variants
    const newItems: SelectedItem[] = selectedVariants.map(selection => {
      const product = categoryProducts.find(p => p.id === selection.productId)!;
      return {
        productId: product.id,
        alias: product.alias,
        category: product.category,
        size: product.size,
        printName: product.printName,
        quantity: parseInt(selection.quantity),
        rate: selectedCategoryRate || selection.rate, // Use category rate if set, otherwise variant rate
        requireSerialNo: categoryMetas[selectedCategory || ''] ?? false,
      };
    });

    // Add to existing category or create new
    setCategoriesInOrder(prev => {
      const existing = prev.find(c => c.category === selectedCategory);
      if (existing) {
        return prev.map(c =>
          c.category === selectedCategory
            ? { ...c, categoryRate: selectedCategoryRate || c.categoryRate, items: newItems }
            : c
        );
      } else {
        return [...prev, { category: selectedCategory!, categoryRate: selectedCategoryRate, items: newItems }];
      }
    });

    handleCloseVariantModal();
  };

  const handleUpdateItem = (categoryName: string, productId: string, field: 'quantity' | 'rate', value: string) => {
    setCategoriesInOrder(prev =>
      prev.map(c =>
        c.category === categoryName
          ? {
              ...c,
              items: c.items.map(i =>
                i.productId === productId
                  ? { ...i, [field]: field === 'quantity' ? (parseInt(value) || 0) : value }
                  : i
              ),
            }
          : c
      )
    );
  };

  const handleRemoveVariant = (categoryName: string, productId: string) => {
    setCategoriesInOrder(prev =>
      prev
        .map(c =>
          c.category === categoryName
            ? { ...c, items: c.items.filter(i => i.productId !== productId) }
            : c
        )
        .filter(c => c.items.length > 0)
    );
  };

  const handleCloseVariantModal = () => {
    setShowVariantModal(false);
    setSelectedCategory(null);
    setSelectedCategoryRate('');
    setVariantSelections([]);
    setCategoryProducts([]);
  };

  const totalParcels = categoriesInOrder.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + item.quantity, 0),
    0
  );

  const submit = async () => {
    if (!partyName.trim()) {
      Alert.alert('Missing Party Name', 'Please enter the party/customer name');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Missing Location', 'Please enter the location/address');
      return;
    }
    if (!godown) {
      Alert.alert('Missing Gowdown', 'Please select which gowdown this order belongs to (Sundha or Lal-Shivnagar)');
      return;
    }
    if (categoriesInOrder.length === 0) {
      Alert.alert('No Products Added', 'Please add at least one product category to the order');
      return;
    }

    setLoading(true);
    try {
      const allItems = categoriesInOrder.flatMap(c => c.items);
      const payload = {
        partyName: partyName.trim(),
        location: location.trim(),
        message: message.trim(),
        godown: godown,
        items: allItems,
        totalParcels: totalParcels,
      };
      console.log('📤 Submitting order:', payload);
      const response = await api.post('/orders', payload);
      console.log('✅ Order created:', response);
      setLoading(false);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      console.error('❌ Order creation error:', e);
      setLoading(false);
      Alert.alert('Error', e.message || 'Failed to create order');
    }
  };

  if (initialLoading) {
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Create Order</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Auto-advance settings */}
        <View style={[styles.settingsRow, isNarrow && styles.settingsRowNarrow]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Auto-Advance</Text>
            <Switch
              value={enableAutoAdvance}
              onValueChange={setEnableAutoAdvance}
              trackColor={{ false: Colors.border, true: Colors.brand + '40' }}
              thumbColor={enableAutoAdvance ? Colors.brand : Colors.textSecondary}
            />
          </View>
          {enableAutoAdvance && (
            <View style={[styles.settingItem, isNarrow && styles.settingItemNarrow]}>
              <Text style={styles.settingLabel}>Delay (ms)</Text>
              <View style={[styles.delayButtonsRow, isNarrow && styles.delayButtonsRowNarrow]}>
                {[2000, 3000, 4000, 5000].map((delay) => (
                  <TouchableOpacity
                    key={delay}
                    style={[styles.delayBtn, isNarrow && styles.delayBtnSmall, autoAdvanceDelay === delay && styles.delayBtnActive]}
                    onPress={() => setAutoAdvanceDelay(delay)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.delayBtnText, autoAdvanceDelay === delay && styles.delayBtnTextActive]}>
                      {delay / 1000}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>PARTY NAME</Text>
          <TextInput
            testID="party-name-input"
            style={styles.input}
            placeholder="e.g. ABC Traders"
            placeholderTextColor={Colors.textSecondary}
            value={partyName}
            onChangeText={setPartyName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>LOCATION</Text>
          <TextInput
            testID="location-input"
            style={styles.input}
            placeholder="e.g. Delhi, Gurgaon"
            placeholderTextColor={Colors.textSecondary}
            value={location}
            onChangeText={setLocation}
            autoCapitalize="words"
          />

          <Text style={styles.label}>GOWDOWN</Text>
          <View style={styles.gowdownBoxes}>
            <TouchableOpacity
              testID="gowdown-sundha"
              style={[styles.gowdownBox, godown === 'Sundha' && styles.gowdownBoxSelected]}
              onPress={() => setGodown('Sundha')}
              activeOpacity={0.7}
            >
              <Ionicons name="home" size={16} color={godown === 'Sundha' ? Colors.brand : Colors.text} />
              <Text style={[styles.gowdownBoxText, godown === 'Sundha' && styles.gowdownBoxTextSelected]}>Sundha</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="gowdown-lal-shivnagar"
              style={[styles.gowdownBox, godown === 'Lal-Shivnagar' && styles.gowdownBoxSelected]}
              onPress={() => setGodown('Lal-Shivnagar')}
              activeOpacity={0.7}
            >
              <Ionicons name="storefront" size={16} color={godown === 'Lal-Shivnagar' ? Colors.brand : Colors.text} />
              <Text style={[styles.gowdownBoxText, godown === 'Lal-Shivnagar' && styles.gowdownBoxTextSelected]}>Lal-Shiv</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>ORDER MESSAGE (Optional)</Text>
          <TextInput
            testID="order-message-input"
            style={[styles.input, styles.messageInput]}
            placeholder="WhatsApp-style order details..."
            placeholderTextColor={Colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>CATEGORIES IN ORDER</Text>
          {categoriesInOrder.length === 0 ? (
            <Text style={styles.emptyText}>No categories added yet</Text>
          ) : (
            categoriesInOrder.map((catInOrder, catIdx) => (
              <View key={catIdx} style={styles.categoryCard}>
                <Text style={styles.categoryName}>{catInOrder.category}</Text>
                {catInOrder.categoryRate && <Text style={styles.categoryRateTag}>Rate: ₹{catInOrder.categoryRate}</Text>}
                <View style={styles.variantsList}>
                  {catInOrder.items.map(item => (
                    <View key={item.productId} style={[styles.variantItem, { paddingVertical: 4 }]}>
                      <Text style={[styles.variantSize, { flex: 1 }]}>{item.size}</Text>
                      <TextInput
                        style={[styles.smallInput, { width: 45, textAlign: 'center' }]}
                        value={String(item.quantity || '')}
                        onChangeText={(val) => handleUpdateItem(catInOrder.category, item.productId, 'quantity', val)}
                        keyboardType="number-pad"
                        placeholder="Qty"
                        placeholderTextColor={Colors.textSecondary}
                      />
                      <TextInput
                        style={[styles.smallInput, { width: 55, textAlign: 'center' }]}
                        value={String(item.rate || '')}
                        onChangeText={(val) => handleUpdateItem(catInOrder.category, item.productId, 'rate', val)}
                        keyboardType="decimal-pad"
                        placeholder="Rate"
                        placeholderTextColor={Colors.textSecondary}
                      />
                      {item.requireSerialNo && (
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                          <Ionicons name="barcode-outline" size={16} color={Colors.brand} />
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => handleRemoveVariant(catInOrder.category, item.productId)}
                        activeOpacity={0.7}
                        style={{ padding: 4 }}
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
            testID="add-category-btn"
            style={styles.addCategoryBtn}
            onPress={handleAddCategory}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
            <Text style={styles.addCategoryText}>Add Category</Text>
          </TouchableOpacity>

          {categoriesInOrder.length > 0 && (
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Parcels:</Text>
                <Text style={styles.summaryValue}>{totalParcels}</Text>
              </View>
            </View>
          )}

          {categoriesInOrder.length > 0 && (
            <TouchableOpacity
              testID="submit-order-btn"
              style={[styles.submitBtn, loading && styles.btnDisabled]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.textInverse} />
                  <Text style={styles.submitText}>Create Order</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Selection Modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <SearchInput
              placeholder="Search categories..."
              value={categorySearch}
              onChangeText={(text: string) => {
                setCategorySearch(text);
                setFilteredCategories(
                  categories.filter(c => c.toLowerCase().includes(text.toLowerCase()))
                );
              }}
            />

            <View style={styles.categoryRateInputSection}>
              <View style={{ marginBottom: 16 }}>
                <Ionicons name="pricetag" size={16} color={Colors.brand} />
                <Text style={styles.categoryRateInputLabel}>Set Rate for This Category (Optional)</Text>
              </View>
              <Text style={styles.categoryRateInputHint}>This rate will auto-fill all variants of this category</Text>
              <TextInput
                style={styles.categoryRateInputField}
                placeholder="e.g. 100"
                placeholderTextColor={Colors.textSecondary}
                value={categoryRateInput}
                onChangeText={setCategoryRateInput}
                keyboardType="decimal-pad"
              />
            </View>

            <FlatList
              data={filteredCategories}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <View style={styles.categoryOptionRow}>
                  <TouchableOpacity
                    style={styles.categoryOption}
                    onPress={() => handleSelectCategory(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryOptionText} numberOfLines={1} ellipsizeMode="tail">{item}</Text>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              scrollEnabled
              keyboardShouldPersistTaps="always"
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Variant Selection Modal - Multi-checkbox */}
      <Modal visible={showVariantModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCategory}</Text>
              <TouchableOpacity onPress={handleCloseVariantModal} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedCategoryRate && (
              <View style={styles.categoryRateBox}>
                <View style={styles.rateBoxHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.brand} />
                  <Text style={styles.categoryRateLabel}>Category Rate: ₹{selectedCategoryRate}</Text>
                </View>
                <Text style={styles.categoryRateNote}>Auto-filled for all variants (editable)</Text>
              </View>
            )}
            {!selectedCategoryRate && (
              <View style={styles.rateRequiredBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.warning} />
                <Text style={styles.rateRequiredText}>Enter rate for each variant</Text>
              </View>
            )}

            <SearchInput
              placeholder="Search variants..."
              value={variantSearch}
              onChangeText={handleVariantSearch}
            />

            <Text style={styles.subLabel}>SELECT VARIANTS & ENTER QUANTITY</Text>
            <FlatList
              data={filteredVariants}
              keyExtractor={item => item.id}
              scrollEnabled
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              renderItem={({ item }) => {
                const selection = variantSelections.find(v => v.productId === item.id);
                return (
                  <View style={styles.variantCheckRow}>
                    <TouchableOpacity
                      style={styles.checkboxArea}
                      onPress={() => toggleVariantSelection(item.id)}
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
                          onChangeText={(val) => {
                            updateVariantField(item.id, 'quantity', val);
                            // Clear existing timer
                            if (autoAdvanceTimers.current[item.id]) {
                              clearTimeout(autoAdvanceTimers.current[item.id]);
                            }
                            // Set auto-advance timer only if enabled
                            if (enableAutoAdvance && val.trim()) {
                              autoAdvanceTimers.current[item.id] = setTimeout(() => {
                                rateInputRefs.current[item.id]?.focus();
                              }, autoAdvanceDelay);
                            }
                          }}
                          onSubmitEditing={() => {
                            // Focus rate input immediately on Enter
                            if (autoAdvanceTimers.current[item.id]) {
                              clearTimeout(autoAdvanceTimers.current[item.id]);
                            }
                            rateInputRefs.current[item.id]?.focus();
                          }}
                          keyboardType="number-pad"
                        />
                        <TextInput
                          ref={(ref) => {
                            if (ref) rateInputRefs.current[item.id] = ref;
                          }}
                          style={[styles.smallInput, styles.rateInput, selectedCategoryRate && styles.rateInputAuto]}
                          placeholder="Rate"
                          placeholderTextColor={Colors.textSecondary}
                          value={selection.rate}
                          onChangeText={(val) => updateVariantField(item.id, 'rate', val)}
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
              onPress={handleAddVariants}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={20} color={Colors.textInverse} />
              <Text style={styles.addVariantsText}>Add All Selected</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.brand + '08', borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsRowNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  settingItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settingItemNarrow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  settingLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  delayButtonsRow: { flexDirection: 'row', gap: Spacing.xs },
  delayButtonsRowNarrow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginLeft: Spacing.sm },
  delayBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  delayBtnSmall: { paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  delayBtnActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  delayBtnText: { fontSize: 10, fontWeight: '600', color: Colors.text },
  delayBtnTextActive: { color: '#fff' },
  scroll: { flex: 1, padding: Spacing.lg },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.md },
  subLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 48, minHeight: 48, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg, marginBottom: Spacing.md },
  messageInput: { height: 100, paddingTop: Spacing.md },
  gowdownBoxes: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  gowdownBox: { flex: 1, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border, borderRadius: 12, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: Spacing.xs, minHeight: 70, justifyContent: 'center' },
  gowdownBoxSelected: { borderColor: Colors.brand, borderWidth: 2, backgroundColor: Colors.brand + '08' },
  gowdownBoxText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  gowdownBoxTextSelected: { color: Colors.brand, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', paddingVertical: Spacing.lg },
  categoryCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.md },
  categoryName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  categoryRateTag: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '700', marginBottom: Spacing.md, backgroundColor: Colors.brand + '15', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: 4, alignSelf: 'flex-start' },
  variantsList: { gap: Spacing.sm },
  variantItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgSecondary, borderRadius: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.md },
  variantSize: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, flex: 1 },
  variantRate: { fontSize: FontSize.sm, color: Colors.brand, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  variantQtyCenter: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, textAlign: 'center', minWidth: 50 },
  addCategoryBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.lg, alignSelf: 'stretch' },
  addCategoryText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  summary: { backgroundColor: Colors.bgSecondary, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.lg, marginTop: Spacing.lg },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  summaryValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.brand },
  submitBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.xl },
  btnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: '700' },
  // Modal styles
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { flex: 1, backgroundColor: Colors.bg, marginTop: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  categoryRateInputSection: { backgroundColor: Colors.brand + '08', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.brand + '20' },
  categoryRateInputLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  categoryRateInputHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  categoryRateInputField: { borderWidth: 1, borderColor: Colors.brand, borderRadius: 10, paddingHorizontal: Spacing.md, height: 44, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  categoryOptionRow: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  categoryOptionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500', flex: 1, marginRight: Spacing.md },
  categoryRateBox: { backgroundColor: Colors.brand + '10', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: Colors.brand },
  rateBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryRateLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.brand, flex: 1 },
  categoryRateNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs, marginLeft: Spacing.lg },
  rateRequiredBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warning + '10', borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.warning },
  rateRequiredText: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '600', flex: 1 },
  variantCheckRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  checkboxArea: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  variantLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  inputRow: { flexDirection: 'row', gap: Spacing.sm },
  smallInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, height: 42, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  qtyInput: { width: 70, textAlign: 'center' },
  rateInput: { width: 80, textAlign: 'center' },
  rateInputAuto: { backgroundColor: Colors.brand + '08', borderColor: Colors.brand },
  addVariantsBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.lg },
  addVariantsText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
});
