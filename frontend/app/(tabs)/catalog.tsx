import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Modal, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { SearchInput } from '../../src/components/SearchInput';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Product {
  id: string;
  category: string;
  size: string;
  printName: string;
  alias: string;
  createdAt: string;
}

interface CategoryGroup {
  category: string;
  count: number;
  expanded: boolean;
  variants: Product[];
}

export default function CatalogScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Form fields
  const [variantForm, setVariantForm] = useState({ size: '', alias: '', printName: '' });
  const [categoryForm, setCategoryForm] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    filterAndGroupCategories();
  }, [products, search]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await api.get('/products');
      setProducts(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const filterAndGroupCategories = () => {
    let filtered = products;

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.category.toLowerCase().includes(q) ||
        p.size.toLowerCase().includes(q) ||
        p.alias.toLowerCase().includes(q)
      );
    }

    const grouped: Record<string, Product[]> = {};
    filtered.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });

    const categoryList = Object.keys(grouped)
      .sort()
      .map(cat => ({
        category: cat,
        count: grouped[cat].length,
        expanded: false,
        variants: grouped[cat].sort((a, b) => a.size.localeCompare(b.size)),
      }));

    setCategories(categoryList);
  };

  const toggleCategoryExpand = (category: string) => {
    setCategories(prev =>
      prev.map(c =>
        c.category === category ? { ...c, expanded: !c.expanded } : c
      )
    );
  };

  const handleAddVariant = async () => {
    if (!variantForm.size.trim() || !variantForm.alias.trim() || !variantForm.printName.trim()) {
      Alert.alert('Missing Fields', 'Please fill all fields');
      return;
    }

    try {
      await api.post('/products', {
        category: selectedCategory,
        size: variantForm.size,
        alias: variantForm.alias,
        printName: variantForm.printName,
      });
      setVariantForm({ size: '', alias: '', printName: '' });
      setShowAddVariantModal(false);
      fetchProducts();
      Alert.alert('Success', 'Variant added to category');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleAddCategory = async () => {
    if (!categoryForm.trim()) {
      Alert.alert('Missing Category', 'Please enter a category name');
      return;
    }

    try {
      await api.post('/products', {
        category: categoryForm,
        size: 'Default',
        alias: 'default-' + categoryForm.toLowerCase().replace(/\s+/g, '-'),
        printName: categoryForm + ' - Default',
      });
      setCategoryForm('');
      setShowAddCategoryModal(false);
      fetchProducts();
      Alert.alert('Success', 'Category created with default variant');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteVariant = (productId: string, size: string) => {
    Alert.alert('Delete Variant', `Delete ${size}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await api.del(`/products/${productId}`);
            fetchProducts();
            Alert.alert('Success', 'Variant deleted');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleDeleteCategory = (category: string) => {
    Alert.alert('Delete Category', `Delete ${category} and all its variants?`, [
      { text: 'Cancel' },
      {
        text: 'Delete All',
        onPress: async () => {
          try {
            const categoryProducts = products.filter(p => p.category === category);
            await Promise.all(categoryProducts.map(p => api.del(`/products/${p.id}`)));
            fetchProducts();
            Alert.alert('Success', 'Category and all variants deleted');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  if (loading && products.length === 0) {
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
      <View style={styles.header}>
        <Text style={styles.title}>Product Catalog</Text>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => setShowAddCategoryModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={28} color={Colors.brand} />
          </TouchableOpacity>
        )}
      </View>

      <SearchInput
        placeholder="Search categories, sizes..."
        value={search}
        onChangeText={setSearch}
      />

      {categories.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>No products found</Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={item => item.category}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: categoryItem }) => (
            <View style={styles.categorySection}>
              {/* Category Header */}
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategoryExpand(categoryItem.category)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryLeft}>
                  <Ionicons
                    name={categoryItem.expanded ? 'chevron-down' : 'chevron-forward'}
                    size={24}
                    color={Colors.brand}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.categoryTitle} numberOfLines={2}>{categoryItem.category}</Text>
                    <Text style={styles.categoryCount}>{categoryItem.count} variant{categoryItem.count !== 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {isAdmin && (
                  <View style={styles.categoryActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedCategory(categoryItem.category);
                        setVariantForm({ size: '', alias: '', printName: '' });
                        setShowAddVariantModal(true);
                      }}
                      style={styles.actionBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={20} color={Colors.brand} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(categoryItem.category)}
                      style={styles.actionBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash" size={20} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>

              {/* Variants List */}
              {categoryItem.expanded && (
                <View style={styles.variantsList}>
                  {categoryItem.variants.map((variant, idx) => (
                    <View key={variant.id} style={styles.variantRow}>
                      <View style={styles.variantInfo}>
                        <Text style={styles.variantSize}>{variant.size}</Text>
                        <Text style={styles.variantAlias}>{variant.alias}</Text>
                      </View>
                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => handleDeleteVariant(variant.id, variant.size)}
                          style={styles.deleteBtn}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash" size={18} color={Colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Add Variant Modal */}
      <Modal visible={showAddVariantModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Variant to {selectedCategory}</Text>
              <TouchableOpacity onPress={() => setShowAddVariantModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>SIZE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 12-12"
              placeholderTextColor={Colors.textSecondary}
              value={variantForm.size}
              onChangeText={v => setVariantForm({ ...variantForm, size: v })}
            />

            <Text style={styles.label}>ALIAS CODE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 18502"
              placeholderTextColor={Colors.textSecondary}
              value={variantForm.alias}
              onChangeText={v => setVariantForm({ ...variantForm, alias: v })}
            />

            <Text style={styles.label}>PRINT NAME</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="e.g. 0 - FILLER 12-12 160 GSM-Y"
              placeholderTextColor={Colors.textSecondary}
              value={variantForm.printName}
              onChangeText={v => setVariantForm({ ...variantForm, printName: v })}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddVariantModal(false)}
                style={[styles.btn, styles.btnSecondary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddVariant}
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>Add Variant</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={showAddCategoryModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Category</Text>
              <TouchableOpacity onPress={() => setShowAddCategoryModal(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>CATEGORY NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 160 GSM SUPER STRONG YELLOW"
              placeholderTextColor={Colors.textSecondary}
              value={categoryForm}
              onChangeText={setCategoryForm}
            />

            <Text style={styles.hint}>A default variant will be created. You can add more sizes later.</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddCategoryModal(false)}
                style={[styles.btn, styles.btnSecondary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddCategory}
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>Create Category</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },

  // Category Styles
  categorySection: { marginBottom: Spacing.lg },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  categoryLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: Spacing.md },
  categoryTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, flex: 1, flexWrap: 'wrap' },
  categoryCount: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  categoryActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { padding: Spacing.sm },

  // Variant Styles
  variantsList: { backgroundColor: Colors.bgSecondary, borderRadius: 8, overflow: 'hidden', marginTop: Spacing.sm },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  variantInfo: { flex: 1 },
  variantSize: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  variantAlias: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '700', marginTop: 2 },
  deleteBtn: { padding: Spacing.sm },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Modal Styles
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.bg,
    marginTop: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.md },
  hint: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    height: 44,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.bgSecondary,
    marginBottom: Spacing.md,
  },
  multilineInput: { height: 100, paddingTop: Spacing.md },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  btn: { flex: 1, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.brand },
  btnSecondary: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: FontSize.md, fontWeight: '700' },
  btnPrimaryText: { color: Colors.textInverse },
  btnSecondaryText: { color: Colors.text },
});
