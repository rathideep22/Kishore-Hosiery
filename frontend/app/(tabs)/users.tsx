import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { SearchInput } from '../../src/components/SearchInput';
import { useResponsive } from '../../src/utils/responsive';
import { getResponsiveTheme } from '../../src/constants/responsiveTheme';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface User {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
}

export default function UsersScreen() {
  const { user } = useAuth();
  const { width } = useResponsive();
  const theme = getResponsiveTheme(width);
  const isSmallPhone = width < 390;
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteUserData, setDeleteUserData] = useState<User | null>(null);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('staff');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get('/users');
      setUsers(data);
      filterUsers(data, search);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filterUsers = (allUsers: User[], searchQuery: string) => {
    if (!searchQuery.trim()) {
      setFilteredUsers(allUsers);
      return;
    }
    const q = searchQuery.toLowerCase();
    const filtered = allUsers.filter(u =>
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.phone.includes(q)
    );
    setFilteredUsers(filtered);
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    filterUsers(users, search);
  }, [search, users]);

  const addUser = async () => {
    if (!phone || !firstName || !lastName) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/users', {
        phone: `+91${phone.replace(/\D/g, '')}`,
        firstName, lastName, role,
      });
      setPhone(''); setFirstName(''); setLastName('');
      setShowForm(false);
      fetchUsers();
      Alert.alert('Success', 'User created successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async (userId: string, name: string) => {
    try {
      console.log('Deleting user:', userId);
      await api.del(`/users/${userId}`);
      console.log('Delete success');
      await fetchUsers();
      Alert.alert('Success', `${name} deleted successfully`);
    } catch (e: any) {
      console.error('Delete failed:', e);
      Alert.alert('Error', e.message || 'Failed to delete user');
    }
  };

  const deleteUser = (u: User) => {
    setDeleteUserData(u);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deleteUserData) {
      setShowDeleteModal(false);
      await performDelete(deleteUserData.id, `${deleteUserData.firstName} ${deleteUserData.lastName}`);
      setDeleteUserData(null);
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View
      testID={`user-card-${item.phone}`}
      style={[styles.userCard]}
    >
      <View style={styles.userCardContent}>
        <View style={styles.userLeft}>
          <View style={[styles.avatar, item.role === 'admin' ? styles.avatarAdmin : styles.avatarStaff]}>
            <Ionicons name={item.role === 'admin' ? 'shield' : 'person'} size={18} color={Colors.textInverse} />
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
            <View style={styles.userMeta}>
              <Ionicons name="call" size={12} color={Colors.textSecondary} />
              <Text style={styles.userPhone}>{item.phone.slice(-6)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.userActions}>
          <View style={[styles.rolePill, item.role === 'admin' ? styles.adminPill : styles.staffPill]}>
            <Text style={[styles.roleText, item.role === 'admin' ? styles.adminText : styles.staffText]}>
              {item.role === 'admin' ? 'ADMIN' : 'STAFF'}
            </Text>
          </View>
          {item.role !== 'admin' && (
            <TouchableOpacity
              testID={`delete-user-${item.phone}`}
              onPress={() => {
                console.log('Delete button pressed for:', item.firstName, item.id);
                deleteUser(item);
              }}
              activeOpacity={0.6}
              style={styles.deleteBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash" size={22} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Users</Text>
            <Text style={styles.subtitle}>Manage team members</Text>
          </View>
          <TouchableOpacity
            testID="toggle-add-user-btn"
            style={styles.addBtn}
            onPress={() => setShowForm(!showForm)}
            activeOpacity={0.7}
          >
            <Ionicons name={showForm ? 'close' : 'person-add'} size={24} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>

        <SearchInput
          placeholder="Search by name or phone..."
          value={search}
          onChangeText={setSearch}
        />

        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add New User</Text>
            <View style={[styles.row, isSmallPhone && { flexDirection: 'column', gap: Spacing.xs }]}>
              <TextInput testID="new-user-fname" style={[styles.input, !isSmallPhone && { flex: 1 }]} placeholder="First Name" placeholderTextColor={Colors.textSecondary} value={firstName} onChangeText={setFirstName} />
              <TextInput testID="new-user-lname" style={[styles.input, !isSmallPhone && { flex: 1 }]} placeholder="Last Name" placeholderTextColor={Colors.textSecondary} value={lastName} onChangeText={setLastName} />
            </View>
            <View style={styles.phoneRow}>
              <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
              <TextInput testID="new-user-phone" style={styles.phoneInput} placeholder="Phone Number" placeholderTextColor={Colors.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} />
            </View>
            <View style={styles.roleRow}>
              <TouchableOpacity
                testID="role-staff-btn"
                style={[styles.roleBtn, role === 'staff' && styles.roleBtnActive]}
                onPress={() => setRole('staff')}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleBtnText, role === 'staff' && styles.roleBtnTextActive]}>Staff</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="role-admin-btn"
                style={[styles.roleBtn, role === 'admin' && styles.roleBtnActive]}
                onPress={() => setRole('admin')}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleBtnText, role === 'admin' && styles.roleBtnTextActive]}>Admin</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity testID="save-user-btn" style={styles.saveBtn} onPress={addUser} disabled={saving} activeOpacity={0.7}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Create User</Text>}
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={Colors.brand} /></View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>{search ? 'No users found' : 'No users yet'}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={item => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.listContent}
            scrollEnabled={!showForm}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} tintColor={Colors.brand} />}
          />
        )}
      </KeyboardAvoidingView>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteUserData && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={32} color={Colors.danger} />
              <Text style={styles.modalTitle}>Delete User</Text>
            </View>
            <Text style={styles.modalMessage}>
              Do you want to delete this user?
            </Text>
            <Text style={styles.modalUserInfo}>
              {deleteUserData.firstName} {deleteUserData.lastName}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnNo}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteUserData(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnNoText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnYes}
                onPress={confirmDelete}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnYesText}>Yes, delete it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.brand, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  form: { margin: Spacing.md, padding: Spacing.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, gap: Spacing.md },
  formTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 0 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, height: 40, minHeight: 40, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.bg },
  phoneRow: { flexDirection: 'row', marginBottom: 0 },
  prefix: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, borderRightWidth: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, justifyContent: 'center', paddingHorizontal: Spacing.sm, height: 40 },
  prefixText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: Spacing.md, fontSize: FontSize.sm, color: Colors.text, height: 40, backgroundColor: Colors.bg },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 0 },
  roleBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, height: 40, justifyContent: 'center', alignItems: 'center' },
  roleBtnActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  roleBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  roleBtnTextActive: { color: Colors.textInverse },
  saveBtn: { backgroundColor: Colors.brand, borderRadius: 8, height: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  saveBtnText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  listContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  userCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  userCardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  userLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarAdmin: { backgroundColor: Colors.brand },
  avatarStaff: { backgroundColor: Colors.info },
  avatarText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  userDetails: { flex: 1 },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.xs },
  userName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  userPhone: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rolePill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' },
  adminPill: { backgroundColor: Colors.brand + '18' },
  staffPill: { backgroundColor: Colors.info + '18' },
  roleText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  adminText: { color: Colors.brand },
  staffText: { color: Colors.info },
  deleteBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.md },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.lg, width: '80%', maxWidth: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalHeader: { alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: Spacing.sm },
  modalMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md, textAlign: 'center' },
  modalUserInfo: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: Spacing.md },
  modalBtnNo: { flex: 1, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, alignItems: 'center' },
  modalBtnNoText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  modalBtnYes: { flex: 1, paddingVertical: Spacing.md, backgroundColor: Colors.danger, borderRadius: 8, alignItems: 'center' },
  modalBtnYesText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
});
