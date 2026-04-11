import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/theme';

// In-app 4x4 numeric keypad that replaces the OS soft keyboard on
// the weight-entry field, so hardware-specific extras (minus sign,
// "hide keyboard" chevron) can't appear.
export interface NumericKeypadProps {
  value: string;
  onChange: (next: string) => void;
  onDone?: () => void;
  allowDecimal?: boolean;
  doneLabel?: string;
}

export function NumericKeypad({
  value,
  onChange,
  onDone,
  allowDecimal = true,
  doneLabel = 'Done',
}: NumericKeypadProps) {
  const append = (char: string) => {
    if (char === '.') {
      if (!allowDecimal || value.includes('.')) return;
      onChange(value.length === 0 ? '0.' : value + '.');
      return;
    }
    onChange(value + char);
  };

  const backspace = () => {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const digit = (n: string) => (
    <TouchableOpacity
      key={n}
      style={styles.key}
      onPress={() => append(n)}
      activeOpacity={0.7}
    >
      <Text style={styles.keyText}>{n}</Text>
    </TouchableOpacity>
  );

  const blank = (id: string) => <View key={id} style={styles.keyBlank} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {digit('1')}
        {digit('2')}
        {digit('3')}
        <TouchableOpacity style={styles.key} onPress={backspace} activeOpacity={0.7}>
          <Ionicons name="backspace-outline" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {digit('4')}
        {digit('5')}
        {digit('6')}
        <TouchableOpacity
          style={[styles.key, styles.doneKey]}
          onPress={onDone}
          activeOpacity={0.85}
        >
          <Text style={styles.doneKeyText}>{doneLabel}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        {digit('7')}
        {digit('8')}
        {digit('9')}
        {blank('r3c4')}
      </View>
      <View style={styles.row}>
        {blank('r4c1')}
        {digit('0')}
        {allowDecimal ? (
          <TouchableOpacity style={styles.key} onPress={() => append('.')} activeOpacity={0.7}>
            <Text style={[styles.keyText, styles.dotText]}>.</Text>
          </TouchableOpacity>
        ) : (
          blank('r4c3')
        )}
        {blank('r4c4')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  key: {
    flex: 1,
    height: 56,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBlank: {
    flex: 1,
    height: 56,
  },
  keyText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  dotText: {
    color: Colors.warning,
    fontWeight: '800',
  },
  doneKey: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  doneKeyText: {
    color: Colors.textInverse,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
});
