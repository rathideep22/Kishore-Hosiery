import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface FilterOption {
  key: string;
  label: string;
}

interface FilterDropdownProps {
  options: FilterOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  placeholder?: string;
}

export function FilterDropdown({
  options,
  selectedKey,
  onSelect,
  placeholder = 'Filter',
}: FilterDropdownProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const selectedLabel =
    options.find(o => o.key === selectedKey)?.label || placeholder;

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setShowDropdown(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{selectedLabel}</Text>
        <Ionicons
          name={showDropdown ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.brand}
        />
      </TouchableOpacity>

      <Modal
        visible={showDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdown(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowDropdown(false)}
        >
          <View style={styles.dropdownContainer}>
            <FlatList
              data={options}
              keyExtractor={item => item.key}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    selectedKey === item.key && styles.optionSelected,
                  ]}
                  onPress={() => {
                    onSelect(item.key);
                    setShowDropdown(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedKey === item.key && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selectedKey === item.key && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={Colors.brand}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginVertical: 6,
    minHeight: 40,
  },
  buttonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: 50,
  },
  dropdownContainer: {
    backgroundColor: Colors.bg,
    marginHorizontal: Spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight: 42,
  },
  optionSelected: {
    backgroundColor: Colors.brand + '10',
  },
  optionText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: Colors.brand,
  },
});
