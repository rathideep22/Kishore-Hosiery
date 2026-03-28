import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface SearchInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholderTextColor?: string;
}

export function SearchInput({
  placeholder,
  value,
  onChangeText,
  placeholderTextColor = Colors.textSecondary,
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.searchContainer, focused && styles.searchContainerFocused]}>
      <Ionicons
        name="search"
        size={20}
        color={focused ? Colors.brand : Colors.textSecondary}
        style={styles.searchIcon}
      />
      <TextInput
        style={styles.searchInputField}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchContainerFocused: {
    borderColor: Colors.brand,
    borderWidth: 2,
    shadowOpacity: 0.15,
    elevation: 4,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInputField: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    padding: 0,
    margin: 0,
  },
});
