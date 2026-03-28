import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SectionList, Modal, Alert, ActivityIndicator,
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

export default function CatalogScreen() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form fields
  const [formData, setFormData] = useState({
    category: '',
    size: '',
    printName: '',
    alias: '',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    const filtered = products.filter(p => {
      const q = search.toLowerCase();
      return p.category.toLowerCase().includes(q) ||
             p.size.toLowerCase().includes(q) ||
             p.alias.toLowerCase().includes(q) ||
             p.printName.toLowerCase().includes(q);
    });
    setFilteredProducts(filtered);
  }, [search, products]);

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

  const groupByCategory = (prods: Product[]) => {
    const grouped: Record<string, Product[]> = {};
    prods.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return Object.keys(grouped)
      .sort()
      .map(cat => ({ title: cat, data: grouped[cat] }));
  };

  const handleAddProduct = async () => {
    if (!formData.category || !formData.size || !formData.alias || !formData.printName) {
      Alert.alert('Error', 'All fields required');
      return;
    }
    try {
      await api.post('/products', formData);
      setFormData({ category: '', size: '', printName: '', alias: '' });
      setShowAddModal(false);
      fetchProducts();
      Alert.alert('Success', 'Product created');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleEditProduct = async () => {
    if (!editingProduct) return;
    try {
      await api.put(`/products/${editingProduct.id}`, {
        category: formData.category || undefined,
        size: formData.size || undefined,
        printName: formData.printName || undefined,
        alias: formData.alias || undefined,
      });
      setEditingProduct(null);
      setFormData({ category: '', size: '', printName: '', alias: '' });
      fetchProducts();
      Alert.alert('Success', 'Product updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteProduct = async (productId: string, alias: string) => {
    Alert.alert('Delete Product', `Delete ${alias}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await api.del(`/products/${productId}`);
            fetchProducts();
            Alert.alert('Success', 'Product deleted');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleDeleteCategory = async (category: string) => {
    Alert.alert(
      'Delete Category',
      `Delete "${category}" and all ${filteredProducts.filter(p => p.category === category).length} variants?`,
      [
        { text: 'Cancel' },
        {
          text: 'Delete All',
          onPress: async () => {
            try {
              const categoryProducts = products.filter(p => p.category === category);
              await Promise.all(categoryProducts.map(p => api.del(`/products/${p.id}`)));
              fetchProducts();
              Alert.alert('Success', `Category and ${categoryProducts.length} variants deleted`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      category: product.category,
      size: product.size,
      printName: product.printName,
      alias: product.alias,
    });
  };

  const sections = groupByCategory(filteredProducts);

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
        {user?.role === 'admin' && (
          <TouchableOpacity
            onPress={() => {
              setEditingProduct(null);
              setFormData({ category: '', size: '', printName: '', alias: '' });
              setShowAddModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={28} color={Colors.brand} />
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by category, size, alias..."
        placeholderTextColor={Colors.textSecondary}
        value={search}
        onChangeText={setSearch}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.id + index}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.alias}>{item.alias}</Text>
              <Text style={styles.size}>{item.size}</Text>
              <Text style={styles.printName} numberOfLines={2}>{item.printName}</Text>
            </View>
            {user?.role === 'admin' && (
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => openEditModal(item)}
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil" size={18} color={Colors.info} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteProduct(item.id, item.alias)}
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash" size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeaderContainer}>
            <Text style={styles.sectionHeader}>{title}</Text>
            {user?.role === 'admin' && (
              <TouchableOpacity
                onPress={() => handleDeleteCategory(title)}
                style={styles.deleteCategoryBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="trash" size={16} color={Colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
      />

      <Modal visible={showAddModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Category"
              placeholderTextColor={Colors.textSecondary}
              value={formData.category}
              onChangeText={v => setFormData({ ...formData, category: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Size"
              placeholderTextColor={Colors.textSecondary}
              value={formData.size}
              onChangeText={v => setFormData({ ...formData, size: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Alias (code)"
              placeholderTextColor={Colors.textSecondary}
              value={formData.alias}
              onChangeText={v => setFormData({ ...formData, alias: v })}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Print Name"
              placeholderTextColor={Colors.textSecondary}
              value={formData.printName}
              onChangeText={v => setFormData({ ...formData, printName: v })}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={[styles.btn, styles.btnSecondary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={editingProduct ? handleEditProduct : handleAddProduct}
                style={[styles.btn, styles.btnPrimary]}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>
                  {editingProduct ? 'Update' : 'Add'}
                </Text>
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
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
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
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 4,
    flex: 1,
  },
  deleteCategoryBtn: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  productCard: {
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
  productInfo: { flex: 1 },
  alias: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  size: { fontSize: FontSize.sm, color: Colors.textSecondary, marginVertical: 2 },
  printName: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginLeft: Spacing.md },
  iconBtn: { padding: Spacing.sm },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { flex: 1, backgroundColor: Colors.bg, marginTop: 'auto', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.lg, height: 44, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bgSecondary, marginBottom: Spacing.md },
  multilineInput: { height: 100, paddingTop: Spacing.md },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  btn: { flex: 1, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.brand },
  btnSecondary: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: FontSize.md, fontWeight: '700' },
  btnPrimaryText: { color: Colors.textInverse },
  btnSecondaryText: { color: Colors.text },
});
