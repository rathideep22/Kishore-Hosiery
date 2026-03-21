import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';

interface GodownEntry { godown: string; readyParcels: number; }
interface Order {
  id: string; orderId: string; partyName: string; message: string;
  totalParcels: number; invoiceGiven: boolean; transportSlip: boolean;
  godownDistribution: GodownEntry[]; readinessStatus: string;
  dispatched: boolean; dispatchedAt: string | null;
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

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  // Godown modal
  const [showGodown, setShowGodown] = useState(false);
  const [godownName, setGodownName] = useState('');
  const [godownParcels, setGodownParcels] = useState('');

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editParty, setEditParty] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editParcels, setEditParcels] = useState('');

  const fetchOrder = useCallback(async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      setOrder(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

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

  const toggleInvoice = async () => {
    setActionLoading('invoice');
    try {
      const data = await api.put(`/orders/${id}/invoice`);
      setOrder(data);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(''); }
  };

  const toggleTransport = async () => {
    setActionLoading('transport');
    try {
      const data = await api.put(`/orders/${id}/transport-slip`);
      setOrder(data);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(''); }
  };

  const toggleDispatch = async () => {
    const action = order?.dispatched ? 'un-dispatch' : 'dispatch';
    Alert.alert('Confirm', `Are you sure you want to ${action} this order?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes', onPress: async () => {
          setActionLoading('dispatch');
          try {
            const data = await api.put(`/orders/${id}/dispatch`);
            setOrder(data);
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setActionLoading(''); }
        },
      },
    ]);
  };

  const addGodownEntry = async () => {
    if (!godownName.trim() || !godownParcels || parseInt(godownParcels) <= 0) {
      Alert.alert('Error', 'Enter godown name and valid parcel count');
      return;
    }
    setActionLoading('godown');
    try {
      const data = await api.put(`/orders/${id}/godown`, {
        godown: godownName.trim(),
        readyParcels: parseInt(godownParcels),
      });
      setOrder(data);
      setShowGodown(false);
      setGodownName('');
      setGodownParcels('');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(''); }
  };

  const saveEdit = async () => {
    setActionLoading('edit');
    try {
      const body: any = {};
      if (editParty !== order?.partyName) body.partyName = editParty;
      if (editMessage !== order?.message) body.message = editMessage;
      if (parseInt(editParcels) !== order?.totalParcels) body.totalParcels = parseInt(editParcels);
      const data = await api.put(`/orders/${id}`, body);
      setOrder(data);
      setShowEdit(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(''); }
  };

  const deleteOrder = () => {
    Alert.alert('Delete Order', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/orders/${id}`);
            router.back();
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const openEdit = () => {
    if (order) {
      setEditParty(order.partyName);
      setEditMessage(order.message);
      setEditParcels(String(order.totalParcels));
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
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrder(); }} tintColor={Colors.brand} />}
        >
          {/* Order Info */}
          <View style={styles.section}>
            <Text style={styles.partyName}>{order.partyName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: (order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Ready' ? Colors.success : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger) + '18' }]}>
              <Text style={[styles.statusBadgeText, { color: order.dispatched ? Colors.textSecondary : order.readinessStatus === 'Ready' ? Colors.success : order.readinessStatus === 'Partial Ready' ? Colors.warning : Colors.danger }]}>
                {order.dispatched ? 'DISPATCHED' : order.readinessStatus.toUpperCase()}
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

          {/* Status Toggles */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STATUS CHECKLIST</Text>
            <StatusToggle label="Invoice Given" value={order.invoiceGiven} onToggle={toggleInvoice} icon="document-text-outline" />
            <StatusToggle label="Transport Slip" value={order.transportSlip} onToggle={toggleTransport} icon="car-outline" />
          </View>

          {/* Godown Distribution */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>GODOWN PARCELS</Text>
              <TouchableOpacity testID="add-godown-btn" onPress={() => setShowGodown(true)} style={styles.addGodownBtn} activeOpacity={0.7}>
                <Ionicons name="add" size={18} color={Colors.textInverse} />
                <Text style={styles.addGodownText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(readyPercent, 100)}%`, backgroundColor: readyPercent >= 100 ? Colors.success : Colors.warning }]} />
              </View>
              <Text style={styles.progressText}>{totalReady}/{order.totalParcels} parcels ready</Text>
            </View>

            {order.godownDistribution.length === 0 ? (
              <Text style={styles.emptyGodown}>No godown entries yet. Tap "Add" to update.</Text>
            ) : (
              order.godownDistribution.map((g, i) => (
                <View key={i} style={styles.godownRow}>
                  <View style={styles.godownLeft}>
                    <Ionicons name="business-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.godownName}>{g.godown}</Text>
                  </View>
                  <Text style={styles.godownParcels}>{g.readyParcels} parcels</Text>
                </View>
              ))
            )}

            {remaining > 0 && !order.dispatched && (
              <View style={styles.pendingBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.warning} />
                <Text style={styles.pendingText}>{remaining} parcels pending</Text>
              </View>
            )}
          </View>

          {/* Dispatch */}
          <View style={styles.section}>
            <TouchableOpacity
              testID="dispatch-btn"
              style={[styles.dispatchBtn, order.dispatched && styles.dispatchBtnDone]}
              onPress={toggleDispatch}
              disabled={actionLoading === 'dispatch'}
              activeOpacity={0.7}
            >
              {actionLoading === 'dispatch' ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name={order.dispatched ? 'close-circle' : 'send'} size={22} color="#FFF" />
                  <Text style={styles.dispatchText}>
                    {order.dispatched ? 'Mark as Not Dispatched' : 'Mark as Dispatched'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Meta */}
          <View style={styles.meta}>
            <Text style={styles.metaText}>Created by {order.createdByName}</Text>
            <Text style={styles.metaText}>{new Date(order.createdAt).toLocaleString()}</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Godown Modal */}
      <Modal visible={showGodown} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Godown Entry</Text>
            <Text style={styles.modalLabel}>GODOWN NAME</Text>
            <TextInput
              testID="godown-name-input"
              style={styles.modalInput}
              placeholder="e.g. G1, Warehouse A"
              placeholderTextColor={Colors.textSecondary}
              value={godownName}
              onChangeText={setGodownName}
            />
            <Text style={styles.modalLabel}>READY PARCELS</Text>
            <TextInput
              testID="godown-parcels-input"
              style={styles.modalInput}
              placeholder="Number of parcels"
              placeholderTextColor={Colors.textSecondary}
              value={godownParcels}
              onChangeText={setGodownParcels}
              keyboardType="number-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity testID="godown-cancel-btn" style={styles.cancelBtn} onPress={() => setShowGodown(false)} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="godown-save-btn" style={styles.saveBtn} onPress={addGodownEntry} disabled={actionLoading === 'godown'} activeOpacity={0.7}>
                {actionLoading === 'godown' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEdit} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Order</Text>
            <Text style={styles.modalLabel}>PARTY NAME</Text>
            <TextInput testID="edit-party-input" style={styles.modalInput} value={editParty} onChangeText={setEditParty} />
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
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, marginTop: Spacing.sm },
  statusBadgeText: { fontSize: FontSize.sm, fontWeight: '700', letterSpacing: 0.5 },
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
  dispatchBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.success, borderRadius: 12, height: 56, gap: Spacing.sm },
  dispatchBtnDone: { backgroundColor: Colors.textSecondary },
  dispatchText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
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
});
