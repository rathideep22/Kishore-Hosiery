import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, FlatList, Checkbox,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/utils/api';
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
}

interface CategoryGroup {
  category: string;
  products: Product[];
  expanded: boolean;
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const [partyName, setPartyName] = useState('');
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await api.get('/products');
      setProducts(data);
      groupProducts(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setInitialLoading(false);
    }
  };

  const groupProducts = (prods: Product[]) => {
    const grouped: Record<string, Product[]> = {};
    prods.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    const cats = Object.keys(grouped)
      .sort()
      .map(cat => ({ category: cat, products: grouped[cat], expanded: false }));
    setCategories(cats);
  };

  const toggleCategory = (index: number) => {
    const newCats = [...categories];
    newCats[index].expanded = !newCats[index].expanded;
    setCategories(newCats);
  };

  const toggleProduct = (product: Product) => {
    const exists = selectedItems.find(item => item.productId === product.id);
    if (exists) {
      setSelectedItems(selectedItems.filter(item => item.productId !== product.id));
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          productId: product.id,
          alias: product.alias,
          category: product.category,
          size: product.size,
          printName: product.printName,
          quantity: 1,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(item => item.productId !== productId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ));
    }
  };

  const totalParcels = selectedItems.reduce((sum, item) => sum + item.quantity, 0);

  const submit = async () => {
    if (!partyName.trim()) { Alert.alert('Error', 'Party name is required'); return; }
    if (!message.trim()) { Alert.alert('Error', 'Order message is required'); return; }
    if (selectedItems.length === 0) { Alert.alert('Error', 'Select at least one product'); return; }

    setLoading(true);
    try {
      await api.post('/orders', {
        partyName: partyName.trim(),
        message: message.trim(),
        items: selectedItems,
        totalParcels: totalParcels,
      });
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLoading(false);
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

  const isProductSelected = (productId: string) => selectedItems.some(item => item.productId === productId);

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

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>PARTY NAME</Text>
          <TextInput
            testID="party-name-input"
            style={styles.input}
            placeholder="e.g. ABC Traders"
            placeholderTextColor={Colors.textSecondary}
            value={partyName}
            onChangeText={setPartyName}
          />

          <Text style={styles.label}>ORDER MESSAGE</Text>
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

          <Text style={styles.label}>SELECT PRODUCTS</Text>
          <View style={styles.productsContainer}>
            {categories.map((cat, catIndex) => (
              <View key={cat.category}>
                <TouchableOpacity
                  style={styles.categoryHeader}
                  onPress={() => toggleCategory(catIndex)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={cat.expanded ? 'chevron-down' : 'chevron-forward'}
                    size={20}
                    color={Colors.text}
                  />
                  <Text style={styles.categoryTitle}>{cat.category}</Text>
                </TouchableOpacity>

                {cat.expanded && (
                  <View style={styles.productsSection}>
                    {cat.products.map(prod => (
                      <View key={prod.id} style={styles.productRow}>
                        <TouchableOpacity
                          style={styles.checkboxArea}
                          onPress={() => toggleProduct(prod)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.checkbox, isProductSelected(prod.id) && styles.checkboxChecked]}>
                            {isProductSelected(prod.id) && (
                              <Ionicons name="checkmark" size={16} color={Colors.textInverse} />
                            )}
                          </View>
                          <View style={styles.productDetails}>
                            <Text style={styles.productAlias}>{prod.alias}</Text>
                            <Text style={styles.productSize}>{prod.size}</Text>
                          </View>
                        </TouchableOpacity>

                        {isProductSelected(prod.id) && (
                          <View style={styles.quantityControl}>
                            <TouchableOpacity
                              onPress={() => {
                                const item = selectedItems.find(i => i.productId === prod.id);
                                if (item) updateQuantity(prod.id, item.quantity - 1);
                              }}
                              style={styles.qtyBtn}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="remove" size={16} color={Colors.text} />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>
                              {selectedItems.find(i => i.productId === prod.id)?.quantity}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                const item = selectedItems.find(i => i.productId === prod.id);
                                if (item) updateQuantity(prod.id, item.quantity + 1);
                              }}
                              style={styles.qtyBtn}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="add" size={16} color={Colors.text} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {selectedItems.length > 0 && (
            <View style={styles.selectedSummary}>
              <Text style={styles.summaryTitle}>Selected Items</Text>
              {selectedItems.map(item => (
                <View key={item.productId} style={styles.summaryItem}>
                  <View>
                    <Text style={styles.summaryItemName}>{item.alias} - {item.size}</Text>
                    <Text style={styles.summaryItemDesc}>{item.printName}</Text>
                  </View>
                  <Text style={styles.summaryItemQty}>{item.quantity}x</Text>
                </View>
              ))}
              <View style={styles.summaryTotal}>
                <Text style={styles.totalLabel}>Total Parcels:</Text>
                <Text style={styles.totalValue}>{totalParcels}</Text>
              </View>
            </View>
          )}

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  scroll: { flex: 1, padding: Spacing.xl },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 52, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  messageInput: { height: 140, paddingTop: Spacing.md },
  productsContainer: { marginBottom: Spacing.lg },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgSecondary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: 8, marginBottom: Spacing.sm },
  categoryTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginLeft: Spacing.sm },
  productsSection: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginBottom: Spacing.md, overflow: 'hidden' },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  checkboxArea: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: Colors.border, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  productDetails: { flex: 1 },
  productAlias: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  productSize: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qtyBtn: { width: 28, height: 28, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, minWidth: 30, textAlign: 'center' },
  selectedSummary: { backgroundColor: Colors.bgSecondary, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.lg },
  summaryTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  summaryItemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  summaryItemDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  summaryItemQty: { fontSize: FontSize.md, fontWeight: '700', color: Colors.brand },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md, paddingTopMargin: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  totalLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  totalValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.brand },
  submitBtn: { flexDirection: 'row', backgroundColor: Colors.brand, borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xxl, gap: Spacing.sm, marginBottom: Spacing.xl },
  btnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
