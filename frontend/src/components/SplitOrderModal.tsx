import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Colors, FontSize, Spacing } from '../constants/theme';

export interface SplitOrderModalProps {
  visible: boolean;
  onClose: () => void;
  // Parent decides what "submit" means — the modal only collects the
  // remainder godown and hands it back. It owns its own submitting state
  // so the parent doesn't need to track yet another boolean.
  onSubmit: (remainderGodown: string) => Promise<void>;
}

export function SplitOrderModal({ visible, onClose, onSubmit }: SplitOrderModalProps) {
  const [godown, setGodown] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setGodown('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!godown) return;
    setSubmitting(true);
    try {
      await onSubmit(godown);
      setGodown('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Split Order</Text>
          <Text style={styles.label}>Select Godown for Remainder</Text>

          <View style={styles.options}>
            <TouchableOpacity
              style={[styles.option, godown === 'Sundha' && styles.optionSelected]}
              onPress={() => setGodown('Sundha')}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionText, godown === 'Sundha' && styles.optionTextSelected]}>
                Sundha
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, godown === 'Lal-Shivnagar' && styles.optionSelected]}
              onPress={() => setGodown('Lal-Shivnagar')}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionText, godown === 'Lal-Shivnagar' && styles.optionTextSelected]}>
                Lal-Shivnagar
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={close} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, (!godown || submitting) && styles.saveDisabled]}
              onPress={handleSubmit}
              disabled={!godown || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveText}>Split</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  content: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    gap: Spacing.lg,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  options: { flexDirection: 'row', gap: Spacing.md },
  option: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  optionSelected: { borderColor: Colors.brand, backgroundColor: Colors.brand + '10' },
  optionText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  optionTextSelected: { color: Colors.brand },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  cancel: {
    flex: 1,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  save: {
    flex: 1,
    backgroundColor: Colors.brand,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textInverse },
});
