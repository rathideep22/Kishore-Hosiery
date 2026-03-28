import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Modal, Alert, ActivityIndicator, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Product {
  id: string;
  category: string;
  size: string;
  printName: string;
  alias: string;
  createdAt: string;
}

type ViewMode = 'categories' | 'variants';

export default function CatalogScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Modals
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form fields
  const [newCategory, setNewCategory] = useState('');
  const [formData, setFormData] = useState({
    size: '',
    printName: '',
    alias: '',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

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

  const getCategories = useCallback(() => {
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats).sort();
  }, [products]);

  const getVariantsInCategory = useCallback((category: string) => {
    return products.filter(p => p.category === category).sort((a, b) => a.alias.localeCompare(b.alias));
  }, [products]);

  const filteredCategories = useCallback(() => {
    const cats = getCategories();
    if (!search.trim()) return cats;
    const q = search.toLowerCase();
    return cats.filter(cat => cat.toLowerCase().includes(q));
  }, [search, getCategories]);

  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      Alert.alert('Error', 'Category name required');
      return;
    }
    if (getCategories().includes(newCategory)) {
      Alert.alert('Error', 'Category already exists');
      return;
    }
    // Category will be created when first variant is added
    setNewCategory('');
    setShowAddCategoryModal(false);
    setSelectedCategory(newCategory);
    setViewMode('variants');
    setShowAddVariantModal(true);
  };

  const handleAddVariant = async () => {
    if (!selectedCategory || !formData.size || !formData.alias || !formData.printName) {
      Alert.alert('Error', 'All fields required');
      return;
    }
    try {
      await api.post('/products', {
        category: selectedCategory,
        size: formData.size,
        printName: formData.printName,
        alias: formData.alias,
      });
      setFormData({ size: '', printName: '', alias: '' });
      setShowAddVariantModal(false);
      fetchProducts();
      Alert.alert('Success', 'Variant added');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleEditVariant = async () => {
    if (!editingProduct) return;
    try {
      await api.put(`/products/${editingProduct.id}`, {
        size: formData.size || undefined,
        printName: formData.printName || undefined,
        alias: formData.alias || undefined,
      });
      setEditingProduct(null);
      setFormData({ size: '', printName: '', alias: '' });
      setShowAddVariantModal(false);
      fetchProducts();
      Alert.alert('Success', 'Variant updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteVariant = (product: Product) => {
    Alert.alert('Delete Variant', `Delete ${product.alias}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await api.del(`/products/${product.id}`);
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
    const variantCount = getVariantsInCategory(category).length;
    Alert.alert('Delete Category', `Delete "${category}" and all ${variantCount} variants?`, [
      { text: 'Cancel' },
      {
        text: 'Delete All',
        onPress: async () => {
          try {
            const categoryProducts = getVariantsInCategory(category);
            await Promise.all(categoryProducts.map(p => api.del(`/products/${p.id}`)));
            fetchProducts();
            Alert.alert('Success', 'Category deleted');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const openEditVariantModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      size: product.size,
      printName: product.printName,
      alias: product.alias,
    });
    setShowAddVariantModal(true);
  };

  const renderCategoryCard = ({ item }: { item: string }) => {
    const variantCount = getVariantsInCategory(item).length;
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        onPress={() => {
          setSelectedCategory(item);
          setViewMode('variants');
        }}
        activeOpacity={0.7}
      >
        <View style={styles.categoryCardLeft}>
          <Text style={styles.categoryName}>{item}</Text>
          <Text style={styles.variantCount}>{variantCount} variant{variantCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.categoryCardRight}>
          <Ionicons name="chevron-forward" size={24} color={Colors.brand} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderVariantCard = ({ item }: { item: Product }) => (
    <View style={styles.variantCard}>
      <View style={styles.variantInfo}>
        <Text style={styles.variantAlias}>{item.alias}</Text>
        <Text style={styles.variantSize}>{item.size}</Text>
        <Text style={styles.variantPrintName} numberOfLines={2}>{item.printName}</Text>
      </View>
      <View style={styles.variantActions}>
        <TouchableOpacity
          onPress={() => openEditVariantModal(item)}
          style={styles.actionBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil" size={18} color={Colors.info} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDeleteVariant(item)}
          style={styles.actionBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="trash" size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && products.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (viewMode === 'variants' && selectedCategory) {
    const variants = getVariantsInCategory(selectedCategory);
    return (
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.variantHeader}>
          <TouchableOpacity
            onPress={() => {
              setViewMode('categories');
              setSelectedCategory(null);
            }}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.brand} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{selectedCategory}</Text>
            <Text style={styles.headerSubtitle}>{variants.length} variant{variants.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                setEditingProduct(null);
                setFormData({ size: '', printName: '', alias: '' });
                setShowAddVariantModal(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={28} color={Colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteCategory(selectedCategory)}
              activeOpacity={0.7}
              style={{ marginLeft: Spacing.sm }}
            >
              <Ionicons name="trash" size={24} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Variants List */}
        {variants.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No variants in this category</Text>
          </View>
        ) : (
          <FlatList
            data={variants}
            renderItem={renderVariantCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.variantsList}
            scrollEnabled
          />
        )}

        {/* Add Variant Modal */}
        <Modal visible={showAddVariantModal} transparent animationType="slide">
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingProduct ? 'Edit Variant' : 'Add Variant'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAddVariantModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>{selectedCategory}</Text>
                </View>

                <Text style={styles.fieldLabel}>Size *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 12-9, 12-12"
                  placeholderTextColor={Colors.textSecondary}
                  value={formData.size}
                  onChangeText={v => setFormData({ ...formData, size: v })}
                />

                <Text style={styles.fieldLabel}>Alias (Code) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 22101"
                  placeholderTextColor={Colors.textSecondary}
                  value={formData.alias}
                  onChangeText={v => setFormData({ ...formData, alias: v })}
                />

                <Text style={styles.fieldLabel}>Print Name *</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="e.g., 0 FILLER 160 GSM KOH YELLOW 12-9"
                  placeholderTextColor={Colors.textSecondary}
                  value={formData.printName}
                  onChangeText={v => setFormData({ ...formData, printName: v })}
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
                    onPress={editingProduct ? handleEditVariant : handleAddVariant}
                    style={[styles.btn, styles.btnPrimary]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.btnText, styles.btnPrimaryText]}>
                      {editingProduct ? 'Update' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  // Categories View
  const categories = filteredCategories();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Product Catalog</Text>
          <Text style={styles.subtitle}>{getCategories().length} categories</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setNewCategory('');
            setShowAddCategoryModal(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={28} color={Colors.success} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search categories..."
        placeholderTextColor={Colors.textSecondary}
        value={search}
        onChangeText={setSearch}
      />

      {/* Categories List */}
      {categories.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>No categories found</Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          renderItem={renderCategoryCard}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoriesList}
          scrollEnabled
        />
      )}

      {/* Add Category Modal */}
      <Modal visible={showAddCategoryModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Category</Text>
              <TouchableOpacity
                onPress={() => setShowAddCategoryModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Category Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 160 GSM SUPER STRONG YELLOW"
                placeholderTextColor={Colors.textSecondary}
                value={newCategory}
                onChangeText={setNewCategory}
                autoFocus
              />

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
                  <Text style={[styles.btnText, styles.btnPrimaryText]}>Create & Add Variant</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  // Search
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    height: 44,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.bgSecondary,
    margin: Spacing.lg,
  },

  // Categories
  categoriesList: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  categoryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  categoryCardLeft: { flex: 1 },
  categoryName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  variantCount: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  categoryCardRight: { marginLeft: Spacing.md },

  // Variants
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: Spacing.sm, marginRight: Spacing.md },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },

  variantsList: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  variantCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  variantInfo: { flex: 1 },
  variantAlias: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  variantSize: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  variantPrintName: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  variantActions: { flexDirection: 'row', gap: Spacing.sm, marginLeft: Spacing.md },
  actionBtn: { padding: Spacing.sm },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.lg },

  // Modal
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.bg,
    marginTop: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    maxHeight: '90%',
  },
  modalScroll: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.md },
  readOnlyField: { backgroundColor: Colors.bgSecondary, borderRadius: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginBottom: Spacing.md },
  readOnlyText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  multilineInput: { height: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing.lg },
  btn: { flex: 1, borderRadius: 8, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: Colors.success },
  btnSecondary: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: FontSize.md, fontWeight: '700' },
  btnPrimaryText: { color: '#FFF' },
  btnSecondaryText: { color: Colors.text },
});
