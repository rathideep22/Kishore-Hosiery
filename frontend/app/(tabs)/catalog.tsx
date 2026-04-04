import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Modal, Alert, ActivityIndicator, ScrollView, useWindowDimensions, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { useResponsive } from '../../src/utils/responsive';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface Product {
  id: string;
  category: string;
  size: string;
  printName: string;
  alias: string;
  createdAt: string;
}

interface Category {
  name: string;
  requireSerialNo: boolean;
}

type ViewMode = 'categories' | 'variants';

export default function CatalogScreen() {
  const { user } = useAuth();
  const { width } = useResponsive();
  const isNarrow = width < 420;
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategoriesState] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Modals
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddVariantModal, setShowAddVariantModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showDeleteVariantModal, setShowDeleteVariantModal] = useState(false);
  const [deleteVariantData, setDeleteVariantData] = useState<Product | null>(null);
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [deleteCategoryData, setDeleteCategoryData] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Category edit modal
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategorySerial, setEditCategorySerial] = useState(false);
  const [savingCategoryMeta, setSavingCategoryMeta] = useState(false);

  // Form fields
  const [newCategory, setNewCategory] = useState('');
  const isAdmin = user?.role === 'admin';
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
      const [data, cats] = await Promise.all([
        api.get('/products'),
        api.get('/products/categories'),
      ]);
      setProducts(data);
      setCategoriesState(cats);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const getCategories = useCallback(() => {
    return categories;
  }, [categories]);

  const getVariantsInCategory = useCallback((category: string) => {
    return products.filter(p => p.category === category).sort((a, b) => a.alias.localeCompare(b.alias));
  }, [products]);

  const filteredCategories = useCallback(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(cat => cat.name.toLowerCase().includes(q));
  }, [search, categories]);

  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      Alert.alert('Error', 'Category name required');
      return;
    }
    if (categories.some(c => c.name === newCategory.trim())) {
      Alert.alert('Error', 'Category already exists');
      return;
    }
    // Category will be created when first variant is added
    const n = newCategory.trim();
    setNewCategory('');
    setShowAddCategoryModal(false);
    setSelectedCategory(n);
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
    setDeleteVariantData(product);
    setShowDeleteVariantModal(true);
  };

  const confirmDeleteVariant = async () => {
    if (!deleteVariantData) return;
    const aliasToDelete = deleteVariantData.alias;
    const idToDelete = deleteVariantData.id;
    setDeleting(true);
    setDeleteMessage(null);
    try {
      console.log('Deleting variant:', idToDelete, aliasToDelete);
      await api.del(`/products/${idToDelete}`);
      console.log('Delete success');
      await fetchProducts();
      setDeleteMessage({ type: 'success', text: `${aliasToDelete} deleted successfully` });
    } catch (e: any) {
      console.error('Delete failed:', e);
      setDeleteMessage({ type: 'error', text: e.message || 'Failed to delete variant' });
    } finally {
      setDeleting(false);
    }
  };

  const closeDeleteVariantModal = () => {
    setShowDeleteVariantModal(false);
    setDeleteVariantData(null);
    setDeleteMessage(null);
  };

  const handleDeleteCategory = (category: string) => {
    setDeleteCategoryData(category);
    setShowDeleteCategoryModal(true);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryData) return;
    const categoryToDelete = deleteCategoryData;
    setDeleting(true);
    setDeleteMessage(null);
    try {
      const categoryProducts = getVariantsInCategory(categoryToDelete);
      console.log(`Deleting category "${categoryToDelete}" with ${categoryProducts.length} variants`);
      await Promise.all(categoryProducts.map(p => api.del(`/products/${p.id}`)));
      console.log('Category delete success');
      await fetchProducts();
      setDeleteMessage({ type: 'success', text: `${categoryToDelete} and ${categoryProducts.length} variant(s) deleted successfully` });
    } catch (e: any) {
      console.error('Category delete failed:', e);
      setDeleteMessage({ type: 'error', text: e.message || 'Failed to delete category' });
    } finally {
      setDeleting(false);
    }
  };

  const closeDeleteCategoryModal = () => {
    setShowDeleteCategoryModal(false);
    setDeleteCategoryData(null);
    setDeleteMessage(null);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setEditCategoryName(cat.name);
    setEditCategorySerial(cat.requireSerialNo);
    setShowEditCategoryModal(true);
  };

  const saveCategoryMeta = async () => {
    if (!editingCategory) return;
    if (!editCategoryName.trim()) {
      Alert.alert('Error', 'Category name cannot be empty');
      return;
    }
    setSavingCategoryMeta(true);
    try {
      await api.put(`/products/categories/${encodeURIComponent(editingCategory.name)}`, {
        requireSerialNo: editCategorySerial,
        newName: editCategoryName.trim(),
      });
      // If category was the currently selected one, update name
      if (selectedCategory === editingCategory.name) {
        setSelectedCategory(editCategoryName.trim());
      }
      setShowEditCategoryModal(false);
      await fetchProducts();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingCategoryMeta(false);
    }
  };

  const closeEditCategoryModal = () => {
    setShowEditCategoryModal(false);
    setEditingCategory(null);
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

  const renderCategoryCard = ({ item }: { item: Category }) => {
    const variantCount = getVariantsInCategory(item.name).length;
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        onPress={() => {
          setSelectedCategory(item.name);
          setViewMode('variants');
        }}
        activeOpacity={0.7}
      >
        <View style={styles.categoryCardLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.categoryName}>{item.name}</Text>
            {item.requireSerialNo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brand + '18', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Ionicons name="barcode-outline" size={12} color={Colors.brand} />
                <Text style={{ fontSize: 10, color: Colors.brand, fontWeight: '700', marginLeft: 3 }}>S/N</Text>
              </View>
            )}
          </View>
          <Text style={styles.variantCount}>{variantCount} variant{variantCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.categoryCardRight}>
          <TouchableOpacity
            onPress={() => openEditCategoryModal(item)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            style={{ padding: 6, marginRight: 4 }}
          >
            <Ionicons name="pencil" size={18} color={Colors.info} />
          </TouchableOpacity>
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
            style={{ flex: 1 }}
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

        {/* Delete Variant Confirmation Modal */}
        {showDeleteVariantModal && deleteVariantData && (
          <View style={styles.modalOverlay}>
            <View style={styles.deleteModalContent}>
              {deleteMessage ? (
                <>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons
                      name={deleteMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                      size={32}
                      color={deleteMessage.type === 'success' ? Colors.success : Colors.danger}
                    />
                    <Text style={styles.deleteModalTitle}>
                      {deleteMessage.type === 'success' ? 'Deleted' : 'Error'}
                    </Text>
                  </View>
                  <Text style={[styles.deleteModalMessage, { color: deleteMessage.type === 'success' ? Colors.success : Colors.danger }]}>
                    {deleteMessage.text}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalBtnYes}
                    onPress={closeDeleteVariantModal}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalBtnYesText}>OK</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons name="alert-circle" size={32} color={Colors.danger} />
                    <Text style={styles.deleteModalTitle}>Delete Variant</Text>
                  </View>
                  <Text style={styles.deleteModalMessage}>
                    Are you sure you want to delete this variant?
                  </Text>
                  <Text style={styles.deleteModalInfo}>
                    {deleteVariantData.alias} ({deleteVariantData.size})
                  </Text>
                  <View style={styles.deleteModalButtons}>
                    <TouchableOpacity
                      style={styles.modalBtnNo}
                      onPress={closeDeleteVariantModal}
                      activeOpacity={0.7}
                      disabled={deleting}
                    >
                      <Text style={styles.modalBtnNoText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalBtnYes}
                      onPress={confirmDeleteVariant}
                      activeOpacity={0.7}
                      disabled={deleting}
                    >
                      <Text style={styles.modalBtnYesText}>{deleting ? 'Deleting...' : 'Yes, delete'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Delete Category Confirmation Modal */}
        {showDeleteCategoryModal && deleteCategoryData && (
          <View style={styles.modalOverlay}>
            <View style={styles.deleteModalContent}>
              {deleteMessage ? (
                <>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons
                      name={deleteMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                      size={32}
                      color={deleteMessage.type === 'success' ? Colors.success : Colors.danger}
                    />
                    <Text style={styles.deleteModalTitle}>
                      {deleteMessage.type === 'success' ? 'Deleted' : 'Error'}
                    </Text>
                  </View>
                  <Text style={[styles.deleteModalMessage, { color: deleteMessage.type === 'success' ? Colors.success : Colors.danger }]}>
                    {deleteMessage.text}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalBtnYes}
                    onPress={closeDeleteCategoryModal}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalBtnYesText}>OK</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.deleteModalHeader}>
                    <Ionicons name="alert-circle" size={32} color={Colors.danger} />
                    <Text style={styles.deleteModalTitle}>Delete Category</Text>
                  </View>
                  <Text style={styles.deleteModalMessage}>
                    Are you sure you want to delete this category and all its variants?
                  </Text>
                  <Text style={styles.deleteModalInfo}>
                    {deleteCategoryData} ({getVariantsInCategory(deleteCategoryData).length} variants)
                  </Text>
                  <View style={styles.deleteModalButtons}>
                    <TouchableOpacity
                      style={styles.modalBtnNo}
                      onPress={closeDeleteCategoryModal}
                      activeOpacity={0.7}
                      disabled={deleting}
                    >
                      <Text style={styles.modalBtnNoText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalBtnYes}
                      onPress={confirmDeleteCategory}
                      activeOpacity={0.7}
                      disabled={deleting}
                    >
                      <Text style={styles.modalBtnYesText}>{deleting ? 'Deleting...' : 'Yes, delete all'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Categories View
  const filteredCats = filteredCategories();

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
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by category name..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories List */}
      {categories.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>No categories found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCats}
          renderItem={renderCategoryCard}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.categoriesList}
          style={{ flex: 1 }}
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
      {/* Edit Category Modal */}
      <Modal visible={showEditCategoryModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Category</Text>
              <TouchableOpacity onPress={closeEditCategoryModal} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Category Name</Text>
              <TextInput
                style={styles.input}
                value={editCategoryName}
                onChangeText={setEditCategoryName}
                placeholder="Category name"
                placeholderTextColor={Colors.textSecondary}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="barcode-outline" size={18} color={Colors.brand} />
                    <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>Require Serial Numbers</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 4 }}>
                    Staff must enter a serial number per parcel for this category
                  </Text>
                </View>
                <Switch
                  value={editCategorySerial}
                  onValueChange={setEditCategorySerial}
                  trackColor={{ false: Colors.border, true: Colors.brand }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={closeEditCategoryModal} style={[styles.btn, styles.btnSecondary]} activeOpacity={0.7}>
                  <Text style={[styles.btnText, styles.btnSecondaryText]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveCategoryMeta} style={[styles.btn, styles.btnPrimary]} activeOpacity={0.7} disabled={savingCategoryMeta}>
                  <Text style={[styles.btnText, styles.btnPrimaryText]}>
                    {savingCategoryMeta ? 'Saving...' : 'Save'}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, flex: 1, numberOfLines: 1 },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, numberOfLines: 1 },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    padding: 0,
  },

  // Categories
  categoriesList: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.xs },
  categoryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: 0,
    gap: Spacing.xs,
  },
  categoryCardLeft: { flex: 1, minWidth: 0 },
  categoryName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, numberOfLines: 1 },
  variantCount: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  categoryCardRight: { marginLeft: Spacing.xs, flexShrink: 0 },

  // Variants
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  backBtn: { padding: Spacing.xs, minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, numberOfLines: 1 },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, numberOfLines: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  variantsList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.xs },
  variantCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: 0,
    gap: Spacing.xs,
  },
  variantInfo: { flex: 1, minWidth: 0 },
  variantAlias: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, numberOfLines: 1 },
  variantSize: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1, numberOfLines: 1 },
  variantPrintName: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, numberOfLines: 1 },
  variantActions: { flexDirection: 'row', gap: Spacing.xs, marginLeft: Spacing.xs, flexShrink: 0 },
  actionBtn: { padding: Spacing.xs, minWidth: 36, minHeight: 36, justifyContent: 'center', alignItems: 'center' },

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

  // Delete Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  deleteModalContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.lg, width: '80%', maxWidth: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  deleteModalHeader: { alignItems: 'center', marginBottom: Spacing.md },
  deleteModalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: Spacing.sm },
  deleteModalMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md, textAlign: 'center' },
  deleteModalInfo: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  deleteModalButtons: { flexDirection: 'row', gap: Spacing.md },
  modalBtnNo: { flex: 1, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, alignItems: 'center' },
  modalBtnNoText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  modalBtnYes: { flex: 1, paddingVertical: Spacing.md, backgroundColor: Colors.danger, borderRadius: 8, alignItems: 'center' },
  modalBtnYesText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
});
