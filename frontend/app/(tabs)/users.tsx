import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('staff');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, []);

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

  const deleteUser = (u: User) => {
    Alert.alert(
      'Delete User',
      `Remove ${u.firstName} ${u.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/users/${u.id}`);
              fetchUsers();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const renderUser = ({ item }: { item: User }) => (
    <View testID={`user-card-${item.phone}`} style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={[styles.avatar, item.role === 'admin' ? styles.avatarAdmin : styles.avatarStaff]}>
          <Text style={styles.avatarText}>{item.firstName[0]}{item.lastName[0]}</Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
          <Text style={styles.userPhone}>{item.phone}</Text>
        </View>
      </View>
      <View style={styles.userActions}>
        <View style={[styles.rolePill, item.role === 'admin' ? styles.adminPill : styles.staffPill]}>
          <Text style={[styles.roleText, item.role === 'admin' ? styles.adminText : styles.staffText]}>
            {item.role.toUpperCase()}
          </Text>
        </View>
        {item.role !== 'admin' && (
          <TouchableOpacity testID={`delete-user-${item.phone}`} onPress={() => deleteUser(item)} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Users</Text>
          <TouchableOpacity
            testID="toggle-add-user-btn"
            style={styles.addBtn}
            onPress={() => setShowForm(!showForm)}
            activeOpacity={0.7}
          >
            <Ionicons name={showForm ? 'close' : 'person-add-outline'} size={20} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>

        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add New User</Text>
            <View style={styles.row}>
              <TextInput testID="new-user-fname" style={[styles.input, { flex: 1 }]} placeholder="First Name" placeholderTextColor={Colors.textSecondary} value={firstName} onChangeText={setFirstName} />
              <TextInput testID="new-user-lname" style={[styles.input, { flex: 1 }]} placeholder="Last Name" placeholderTextColor={Colors.textSecondary} value={lastName} onChangeText={setLastName} />
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
        ) : (
          <FlatList
            data={users}
            keyExtractor={item => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} tintColor={Colors.brand} />}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  addBtn: { backgroundColor: Colors.brand, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  form: { margin: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
  formTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, height: 48, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.bg },
  phoneRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  prefix: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, borderRightWidth: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, justifyContent: 'center', paddingHorizontal: Spacing.md, height: 48 },
  prefixText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: Spacing.md, fontSize: FontSize.md, color: Colors.text, height: 48, backgroundColor: Colors.bg },
  roleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  roleBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center' },
  roleBtnActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  roleBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  roleBtnTextActive: { color: Colors.textInverse },
  saveBtn: { backgroundColor: Colors.brand, borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  userCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.sm },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarAdmin: { backgroundColor: Colors.brand },
  avatarStaff: { backgroundColor: Colors.info },
  avatarText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.md },
  userDetails: { marginLeft: Spacing.md, flex: 1 },
  userName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  userPhone: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rolePill: { borderRadius: 12, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  adminPill: { backgroundColor: Colors.brand + '18' },
  staffPill: { backgroundColor: Colors.info + '18' },
  roleText: { fontSize: FontSize.xs, fontWeight: '700' },
  adminText: { color: Colors.brand },
  staffText: { color: Colors.info },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
